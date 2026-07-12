const API_URL = window.location.origin + '/api';
let allAccounts = [];
let selectedAccounts = new Set();

// ============ CHECK SERVER ============
async function checkServer() {
    try {
        const response = await fetch('/api/health');
        if (response.ok) {
            console.log('✅ Server is running');
            return true;
        }
    } catch (error) {
        console.error('❌ Server not reachable:', error);
        return false;
    }
    return false;
}

// ============ LOAD DATA ============
async function loadData() {
    const serverOk = await checkServer();
    if (!serverOk) {
        alert('❌ Server tidak merespon!\n\n' +
              'Pastikan:\n' +
              '1. Server berjalan (npm start)\n' +
              '2. MongoDB Atlas terhubung\n' +
              '3. Koneksi internet stabil');
        return;
    }
    
    try {
        await Promise.all([loadAccounts(), loadStatistics()]);
    } catch (error) {
        console.error('Error loading data:', error);
        showNotification('❌ Gagal memuat data: ' + error.message, 'error');
    }
}

async function loadAccounts() {
    try {
        const response = await fetch(`${API_URL}/accounts`);
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to fetch accounts');
        }
        allAccounts = await response.json();
        renderAccounts(allAccounts);
    } catch (error) {
        console.error('Error loading accounts:', error);
        showNotification('❌ Gagal memuat akun: ' + error.message, 'error');
    }
}

async function loadStatistics() {
    try {
        const response = await fetch(`${API_URL}/statistics`);
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to fetch statistics');
        }
        const stats = await response.json();
        
        document.getElementById('total').textContent = stats.total || 0;
        document.getElementById('available_3d').textContent = stats.available_3d || 0;
        document.getElementById('available_7d').textContent = stats.available_7d || 0;
        document.getElementById('sold').textContent = stats.sold || 0;
        document.getElementById('personal').textContent = stats.personal || 0;
    } catch (error) {
        console.error('Error loading statistics:', error);
        showNotification('❌ Gagal memuat statistik: ' + error.message, 'error');
    }
}

// ============ NOTIFICATION ============
function showNotification(message, type = 'info') {
    const existing = document.querySelector('.notification');
    if (existing) existing.remove();
    
    const notif = document.createElement('div');
    notif.className = `notification ${type}`;
    notif.innerHTML = `
        <span>${message}</span>
        <button onclick="this.parentElement.remove()" style="background: none; border: none; color: white; font-size: 20px; cursor: pointer;">&times;</button>
    `;
    document.body.appendChild(notif);
    
    setTimeout(() => {
        if (notif.parentElement) notif.remove();
    }, 5000);
}

// ============ RENDER ACCOUNTS ============
function renderAccounts(accounts) {
    const tbody = document.getElementById('accountTableBody');
    
    if (!accounts || accounts.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" style="text-align: center; padding: 40px; color: #888;">
                    <i class="fas fa-inbox" style="font-size: 40px; display: block; margin-bottom: 10px;"></i>
                    Belum ada akun. Tambahkan akun sekarang!
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = accounts.map(account => {
        const statusClass = account.status === 'available' || account.status === 'available_3d' ? 'status-available' :
                           account.status === 'sold' ? 'status-sold' : 'status-personal';
        const statusLabel = account.status === 'available' ? '🟢 Tersedia' :
                           account.status === 'available_3d' ? '🟡 3 Hari' :
                           account.status === 'sold' ? '🔴 Terjual' : '🔵 Pribadi';
        const days = account.days || 0;
        const createdDate = new Date(account.created_at).toLocaleString('id-ID', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
        
        return `
            <tr>
                <td>
                    <input type="checkbox" class="account-checkbox" 
                           value="${account._id}" onchange="toggleAccount('${account._id}')">
                </td>
                <td><code>#${account._id.slice(-6)}</code></td>
                <td><strong>${account.username}</strong></td>
                <td>${account.email || '-'}</td>
                <td>${days} hari</td>
                <td>${createdDate}</td>
                <td><span class="status-badge ${statusClass}">${statusLabel}</span></td>
                <td>
                    <button class="btn-action btn-detail" onclick="showDetail('${account._id}')" title="Detail">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button class="btn-action btn-edit" onclick="editAccount('${account._id}')" title="Edit">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn-action btn-delete" onclick="deleteAccount('${account._id}')" title="Hapus">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
    
    selectedAccounts.clear();
    document.getElementById('selectAll').checked = false;
}

// ============ FILTER ACCOUNTS ============
function filterAccounts() {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();
    const statusFilter = document.getElementById('statusFilter').value;
    
    let filtered = allAccounts;
    
    if (searchTerm) {
        filtered = filtered.filter(acc => 
            acc.username.toLowerCase().includes(searchTerm) ||
            (acc.email && acc.email.toLowerCase().includes(searchTerm))
        );
    }
    
    if (statusFilter !== 'all') {
        filtered = filtered.filter(acc => acc.status === statusFilter);
    }
    
    renderAccounts(filtered);
}

// ============ SELECT ALL ============
function toggleSelectAll() {
    const checked = document.getElementById('selectAll').checked;
    const checkboxes = document.querySelectorAll('.account-checkbox');
    
    checkboxes.forEach(cb => {
        cb.checked = checked;
        if (checked) {
            selectedAccounts.add(cb.value);
        } else {
            selectedAccounts.delete(cb.value);
        }
    });
}

function toggleAccount(id) {
    if (selectedAccounts.has(id)) {
        selectedAccounts.delete(id);
    } else {
        selectedAccounts.add(id);
    }
}

// ============ ADD ACCOUNT ============
function showAddForm() {
    document.getElementById('addForm').classList.remove('hidden');
    document.getElementById('bulkForm').classList.add('hidden');
    document.getElementById('statusForm').classList.add('hidden');
    document.getElementById('ambilForm').classList.add('hidden');
}

function hideAddForm() {
    document.getElementById('addForm').classList.add('hidden');
    document.getElementById('addAccountForm').reset();
}

document.getElementById('addAccountForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const email = document.getElementById('email').value;
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const totp = document.getElementById('totp').value;
    
    if (!username || !password) {
        showNotification('❌ Username dan password wajib diisi!', 'error');
        return;
    }
    
    try {
        const response = await fetch(`${API_URL}/accounts`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, username, password, totp })
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to add account');
        }
        
        showNotification('✅ Akun berhasil ditambahkan!', 'success');
        hideAddForm();
        loadData();
    } catch (error) {
        console.error('Error adding account:', error);
        showNotification('❌ Gagal menambahkan akun: ' + error.message, 'error');
    }
});

// ============ BULK ADD ============
function showBulkAdd() {
    document.getElementById('bulkForm').classList.remove('hidden');
    document.getElementById('addForm').classList.add('hidden');
    document.getElementById('statusForm').classList.add('hidden');
    document.getElementById('ambilForm').classList.add('hidden');
}

function hideBulkForm() {
    document.getElementById('bulkForm').classList.add('hidden');
    document.getElementById('bulkData').value = '';
}

async function submitBulk() {
    const data = document.getElementById('bulkData').value;
    const lines = data.split('\n').filter(line => line.trim());
    
    if (lines.length === 0) {
        showNotification('❌ Masukkan data akun!', 'error');
        return;
    }
    
    const accounts = lines.map(line => {
        const parts = line.split(':').map(p => p.trim());
        if (parts.length === 3) {
            return { email: '', username: parts[0], password: parts[1], totp: parts[2] };
        } else if (parts.length === 4) {
            return { email: parts[0], username: parts[1], password: parts[2], totp: parts[3] };
        }
        return null;
    }).filter(acc => acc && acc.username && acc.password);
    
    if (accounts.length === 0) {
        showNotification('❌ Format data salah! Gunakan: email:username:password:totp', 'error');
        return;
    }
    
    if (!confirm(`Tambahkan ${accounts.length} akun?`)) return;
    
    try {
        const response = await fetch(`${API_URL}/accounts/bulk`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ accounts })
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to add accounts');
        }
        
        const result = await response.json();
        showNotification(`✅ ${result.message}`, 'success');
        hideBulkForm();
        loadData();
    } catch (error) {
        console.error('Error adding accounts:', error);
        showNotification('❌ Gagal menambahkan akun: ' + error.message, 'error');
    }
}

// ============ AMBIL AKUN ============
function showAmbilForm() {
    document.getElementById('ambilForm').classList.remove('hidden');
    document.getElementById('addForm').classList.add('hidden');
    document.getElementById('bulkForm').classList.add('hidden');
    document.getElementById('statusForm').classList.add('hidden');
    
    // Tampilkan daftar akun yang available
    const list = document.getElementById('ambilAccountList');
    const availableAccounts = allAccounts.filter(acc => 
        acc.status === 'available' || acc.status === 'available_3d'
    );
    
    if (availableAccounts.length === 0) {
        list.innerHTML = '<p style="color: #888; padding: 20px;">Tidak ada akun yang tersedia</p>';
        return;
    }
    
    list.innerHTML = availableAccounts.map(acc => {
        const statusLabel = acc.status === 'available' ? 'Tersedia' : '3 Hari';
        return `
            <div style="padding: 10px; border-bottom: 1px solid #eee; display: flex; align-items: center; gap: 10px;">
                <input type="checkbox" class="ambil-checkbox" value="${acc._id}" 
                       onchange="toggleAmbilAccount('${acc._id}')">
                <strong>${acc.username}</strong> 
                (${acc.email || '-'}) - 
                <span class="status-badge status-available">${statusLabel}</span>
                <span style="color: #888; font-size: 12px;">${acc.days || 0} hari</span>
            </div>
        `;
    }).join('');
    
    window.ambilSelected = new Set();
}

function toggleAmbilAccount(id) {
    if (window.ambilSelected.has(id)) {
        window.ambilSelected.delete(id);
    } else {
        window.ambilSelected.add(id);
    }
}

function hideAmbilForm() {
    document.getElementById('ambilForm').classList.add('hidden');
}

async function ambilAkun() {
    const ids = Array.from(window.ambilSelected || []);
    
    if (ids.length === 0) {
        showNotification('❌ Pilih minimal 1 akun!', 'error');
        return;
    }
    
    // Ambil data akun
    const accounts = allAccounts.filter(acc => ids.includes(acc._id));
    
    // Format: email:username:password:totp
    let text = accounts.map(acc => {
        return `${acc.email || ''}:${acc.username}:${acc.password}:${acc.totp || ''}`;
    }).join('\n');
    
    // Tampilkan pilihan
    const choice = confirm(
        `📤 ${accounts.length} akun siap diambil!\n\n` +
        `Pilih:\n` +
        `• OK = Salin ke clipboard\n` +
        `• Cancel = Download sebagai TXT`
    );
    
    if (choice) {
        // Salin ke clipboard
        try {
            await navigator.clipboard.writeText(text);
            showNotification(`✅ ${accounts.length} akun berhasil disalin ke clipboard!`, 'success');
            
            // Ubah status menjadi sold
            await updateStatusAkun(ids, 'sold');
            hideAmbilForm();
        } catch (err) {
            // Fallback jika clipboard gagal
            copyToClipboardFallback(text);
        }
    } else {
        // Download sebagai TXT
        const blob = new Blob([text], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `akun_${new Date().toISOString().slice(0,10)}.txt`;
        a.click();
        URL.revokeObjectURL(url);
        
        showNotification(`✅ ${accounts.length} akun berhasil di-download!`, 'success');
        
        // Ubah status menjadi sold
        await updateStatusAkun(ids, 'sold');
        hideAmbilForm();
    }
}

function copyToClipboardFallback(text) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    showNotification('✅ Akun berhasil disalin ke clipboard!', 'success');
}

async function updateStatusAkun(ids, status) {
    try {
        const response = await fetch(`${API_URL}/accounts/bulk/status`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids, status })
        });
        
        if (!response.ok) {
            throw new Error('Failed to update status');
        }
        
        await loadData();
    } catch (error) {
        console.error('Error updating status:', error);
    }
}

// ============ BULK STATUS ============
function showBulkStatus() {
    document.getElementById('statusForm').classList.remove('hidden');
    document.getElementById('addForm').classList.add('hidden');
    document.getElementById('bulkForm').classList.add('hidden');
    document.getElementById('ambilForm').classList.add('hidden');
    
    const list = document.getElementById('statusAccountList');
    if (allAccounts.length === 0) {
        list.innerHTML = '<p style="color: #888; padding: 20px;">Belum ada akun</p>';
        return;
    }
    
    list.innerHTML = allAccounts.map(acc => {
        const statusClass = acc.status === 'available' || acc.status === 'available_3d' ? 'status-available' :
                           acc.status === 'sold' ? 'status-sold' : 'status-personal';
        const statusLabel = acc.status === 'available' ? 'Tersedia' :
                           acc.status === 'available_3d' ? '3 Hari' :
                           acc.status === 'sold' ? 'Terjual' : 'Pribadi';
        return `
            <div style="padding: 10px; border-bottom: 1px solid #eee; display: flex; align-items: center; gap: 10px;">
                <input type="checkbox" class="status-checkbox" value="${acc._id}" 
                       onchange="toggleStatusAccount('${acc._id}')">
                <strong>${acc.username}</strong> 
                (${acc.email || '-'}) - 
                <span class="status-badge ${statusClass}">${statusLabel}</span>
            </div>
        `;
    }).join('');
    
    window.statusSelected = new Set();
}

function toggleStatusAccount(id) {
    if (window.statusSelected.has(id)) {
        window.statusSelected.delete(id);
    } else {
        window.statusSelected.add(id);
    }
}

function hideStatusForm() {
    document.getElementById('statusForm').classList.add('hidden');
}

async function updateBulkStatus(status) {
    const ids = Array.from(window.statusSelected || []);
    
    if (ids.length === 0) {
        showNotification('❌ Pilih minimal 1 akun!', 'error');
        return;
    }
    
    const statusLabel = status === 'sold' ? 'Terjual' : 
                        status === 'personal' ? 'Pribadi' : 
                        status === 'available_3d' ? '3 Hari' : 'Tersedia';
    
    if (!confirm(`Ubah ${ids.length} akun menjadi "${statusLabel}"?`)) return;
    
    try {
        console.log('📝 Updating status for IDs:', ids);
        console.log('📝 New status:', status);
        
        const response = await fetch(`${API_URL}/accounts/bulk/status`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids, status })
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to update status');
        }
        
        const result = await response.json();
        console.log('✅ Update result:', result);
        
        showNotification(`✅ ${result.message}`, 'success');
        hideStatusForm();
        await loadData();
    } catch (error) {
        console.error('❌ Error updating status:', error);
        showNotification('❌ Gagal mengupdate status: ' + error.message, 'error');
    }
}

// ============ DETAIL ACCOUNT ============
function showDetail(id) {
    const account = allAccounts.find(a => a._id === id);
    if (!account) {
        showNotification('❌ Akun tidak ditemukan', 'error');
        return;
    }
    
    const modal = document.getElementById('accountModal');
    const body = document.getElementById('modalBody');
    const title = document.getElementById('modalTitle');
    
    title.textContent = `🔐 Detail Akun - ${account.username}`;
    
    const createdDate = new Date(account.created_at).toLocaleString('id-ID', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
    
    body.innerHTML = `
        <div style="padding: 10px 0;">
            <div style="background: #f8f9fa; padding: 15px; border-radius: 10px; margin-bottom: 15px;">
                <p style="margin: 8px 0;"><strong>🆔 ID:</strong> <code style="background: #fff; padding: 2px 8px; border-radius: 4px;">${account._id}</code></p>
                <p style="margin: 8px 0;"><strong>👤 Username:</strong> <strong>${account.username}</strong></p>
                <p style="margin: 8px 0;"><strong>📧 Email:</strong> ${account.email || '-'}</p>
            </div>
            <div style="background: #fff3cd; padding: 15px; border-radius: 10px; margin-bottom: 15px; border-left: 4px solid #ffc107;">
                <p style="margin: 8px 0;"><strong>🔑 Password:</strong> <code style="background: #fff; padding: 2px 8px; border-radius: 4px;">${account.password}</code></p>
                <p style="margin: 8px 0;"><strong>📱 TOTP:</strong> ${account.totp || '-'}</p>
            </div>
            <div style="background: #d1ecf1; padding: 15px; border-radius: 10px;">
                <p style="margin: 8px 0;"><strong>📌 Status:</strong> 
                    <span class="status-badge ${account.status === 'available' || account.status === 'available_3d' ? 'status-available' : account.status === 'sold' ? 'status-sold' : 'status-personal'}">
                        ${account.status === 'available' ? '🟢 Tersedia' : account.status === 'available_3d' ? '🟡 3 Hari' : account.status === 'sold' ? '🔴 Terjual' : '🔵 Pribadi'}
                    </span>
                </p>
                <p style="margin: 8px 0;"><strong>⏳ Umur:</strong> ${account.days || 0} hari</p>
                <p style="margin: 8px 0;"><strong>📅 Ditambahkan:</strong> ${createdDate}</p>
            </div>
        </div>
    `;
    
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}

function closeModal() {
    const modal = document.getElementById('accountModal');
    modal.classList.add('hidden');
    document.body.style.overflow = 'auto';
}

function closeModalOutside(event) {
    if (event.target === event.currentTarget) {
        closeModal();
    }
}

document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape') {
        closeModal();
    }
});

// ============ EDIT ACCOUNT ============
function editAccount(id) {
    const account = allAccounts.find(a => a._id === id);
    if (!account) return;
    
    const fields = [
        { key: 'username', label: 'Username', value: account.username },
        { key: 'email', label: 'Email', value: account.email || '' },
        { key: 'password', label: 'Password', value: account.password },
        { key: 'totp', label: 'TOTP', value: account.totp || '' }
    ];
    
    let message = '✏️ EDIT DATA AKUN\n\n';
    fields.forEach(f => {
        message += `${f.label}: ${f.value}\n`;
    });
    message += '\nMasukkan data baru dengan format:\n';
    message += 'username|email|password|totp\n';
    message += '(Kosongkan jika tidak diubah)\n\n';
    message += 'Contoh: newuser|new@email.com|NewPass123|654321';
    
    const input = prompt(message, `${account.username}|${account.email || ''}|${account.password}|${account.totp || ''}`);
    
    if (input === null) return;
    
    const parts = input.split('|').map(p => p.trim());
    if (parts.length < 4) {
        showNotification('❌ Format salah! Gunakan: username|email|password|totp', 'error');
        return;
    }
    
    const [username, email, password, totp] = parts;
    const updateData = {};
    if (username) updateData.username = username;
    if (email !== undefined) updateData.email = email;
    if (password) updateData.password = password;
    if (totp !== undefined) updateData.totp = totp;
    
    updateAccount(id, updateData);
}

async function updateAccount(id, data) {
    try {
        console.log('📝 Updating account:', id, data);
        
        const response = await fetch(`${API_URL}/accounts/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to update account');
        }
        
        showNotification('✅ Akun berhasil diupdate!', 'success');
        await loadData();
    } catch (error) {
        console.error('❌ Error updating account:', error);
        showNotification('❌ Gagal mengupdate akun: ' + error.message, 'error');
    }
}

// ============ DELETE ACCOUNT ============
async function deleteAccount(id) {
    const account = allAccounts.find(a => a._id === id);
    if (!account) return;
    
    const confirmMsg = `⚠️ HAPUS AKUN\n\n` +
                       `Username: ${account.username}\n` +
                       `Email: ${account.email || '-'}\n` +
                       `Status: ${account.status}\n\n` +
                       `Yakin ingin menghapus akun ini?`;
    
    if (!confirm(confirmMsg)) return;
    
    try {
        console.log('🗑️ Deleting account:', id);
        
        const response = await fetch(`${API_URL}/accounts/${id}`, {
            method: 'DELETE'
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to delete account');
        }
        
        showNotification('✅ Akun berhasil dihapus!', 'success');
        await loadData();
    } catch (error) {
        console.error('❌ Error deleting account:', error);
        showNotification('❌ Gagal menghapus akun: ' + error.message, 'error');
    }
}

// ============ REFRESH ============
function refreshData() {
    loadData();
}

// ============ INIT ============
document.addEventListener('DOMContentLoaded', loadData);
