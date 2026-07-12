const API_URL = 'http://localhost:3000/api';
let allAccounts = [];
let selectedAccounts = new Set();

// ============ LOAD DATA ============
async function loadData() {
    try {
        await Promise.all([loadAccounts(), loadStatistics()]);
    } catch (error) {
        console.error('Error loading data:', error);
        alert('❌ Gagal memuat data. Pastikan server berjalan.');
    }
}

async function loadAccounts() {
    try {
        const response = await fetch(`${API_URL}/accounts`);
        if (!response.ok) throw new Error('Failed to fetch accounts');
        allAccounts = await response.json();
        renderAccounts(allAccounts);
    } catch (error) {
        console.error('Error loading accounts:', error);
    }
}

async function loadStatistics() {
    try {
        const response = await fetch(`${API_URL}/statistics`);
        if (!response.ok) throw new Error('Failed to fetch statistics');
        const stats = await response.json();
        
        document.getElementById('total').textContent = stats.total || 0;
        document.getElementById('available_3d').textContent = stats.available_3d || 0;
        document.getElementById('available_7d').textContent = stats.available_7d || 0;
        document.getElementById('sold').textContent = stats.sold || 0;
        document.getElementById('personal').textContent = stats.personal || 0;
    } catch (error) {
        console.error('Error loading statistics:', error);
    }
}

// ============ RENDER ACCOUNTS ============
function renderAccounts(accounts) {
    const tbody = document.getElementById('accountTableBody');
    
    if (!accounts || accounts.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align: center; padding: 40px; color: #888;">
                    <i class="fas fa-inbox" style="font-size: 40px; display: block; margin-bottom: 10px;"></i>
                    Belum ada akun. Tambahkan akun sekarang!
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = accounts.map(account => {
        const statusClass = account.status === 'available' ? 'status-available' :
                           account.status === 'sold' ? 'status-sold' : 'status-personal';
        const statusLabel = account.status === 'available' ? '🟢 Tersedia' :
                           account.status === 'sold' ? '🔴 Terjual' : '🔵 Pribadi';
        const days = account.days || 0;
        
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
    
    // Reset selected accounts
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
        alert('❌ Username dan password wajib diisi!');
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
        
        alert('✅ Akun berhasil ditambahkan!');
        hideAddForm();
        loadData();
    } catch (error) {
        console.error('Error adding account:', error);
        alert('❌ Gagal menambahkan akun: ' + error.message);
    }
});

// ============ BULK ADD ============
function showBulkAdd() {
    document.getElementById('bulkForm').classList.remove('hidden');
    document.getElementById('addForm').classList.add('hidden');
    document.getElementById('statusForm').classList.add('hidden');
}

function hideBulkForm() {
    document.getElementById('bulkForm').classList.add('hidden');
    document.getElementById('bulkData').value = '';
}

async function submitBulk() {
    const data = document.getElementById('bulkData').value;
    const lines = data.split('\n').filter(line => line.trim());
    
    if (lines.length === 0) {
        alert('❌ Masukkan data akun!');
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
        alert('❌ Format data salah! Gunakan: email:username:password:totp');
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
        alert(`✅ ${result.message}`);
        hideBulkForm();
        loadData();
    } catch (error) {
        console.error('Error adding accounts:', error);
        alert('❌ Gagal menambahkan akun: ' + error.message);
    }
}

// ============ BULK STATUS ============
function showBulkStatus() {
    document.getElementById('statusForm').classList.remove('hidden');
    document.getElementById('addForm').classList.add('hidden');
    document.getElementById('bulkForm').classList.add('hidden');
    
    // Tampilkan daftar akun yang bisa dipilih
    const list = document.getElementById('statusAccountList');
    if (allAccounts.length === 0) {
        list.innerHTML = '<p style="color: #888; padding: 20px;">Belum ada akun</p>';
        return;
    }
    
    list.innerHTML = allAccounts.map(acc => {
        const statusClass = acc.status === 'available' ? 'status-available' :
                           acc.status === 'sold' ? 'status-sold' : 'status-personal';
        const statusLabel = acc.status === 'available' ? 'Tersedia' :
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
        alert('❌ Pilih minimal 1 akun!');
        return;
    }
    
    const statusLabel = status === 'sold' ? 'Terjual' : 
                        status === 'personal' ? 'Pribadi' : 'Tersedia';
    
    if (!confirm(`Ubah ${ids.length} akun menjadi "${statusLabel}"?`)) return;
    
    try {
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
        alert(`✅ ${result.message}`);
        hideStatusForm();
        loadData();
    } catch (error) {
        console.error('Error updating status:', error);
        alert('❌ Gagal mengupdate status: ' + error.message);
    }
}

// ============ DETAIL ACCOUNT ============
function showDetail(id) {
    const account = allAccounts.find(a => a._id === id);
    if (!account) {
        alert('❌ Akun tidak ditemukan');
        return;
    }
    
    const modal = document.getElementById('accountModal');
    const body = document.getElementById('modalBody');
    const title = document.getElementById('modalTitle');
    
    title.textContent = `🔐 Detail Akun - ${account.username}`;
    
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
                    <span class="status-badge ${account.status === 'available' ? 'status-available' : account.status === 'sold' ? 'status-sold' : 'status-personal'}">
                        ${account.status === 'available' ? '🟢 Tersedia' : account.status === 'sold' ? '🔴 Terjual' : '🔵 Pribadi'}
                    </span>
                </p>
                <p style="margin: 8px 0;"><strong>⏳ Umur:</strong> ${account.days || 0} hari</p>
                <p style="margin: 8px 0;"><strong>📅 Dibuat:</strong> ${new Date(account.created_at).toLocaleString('id-ID')}</p>
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

// Keyboard shortcut: ESC to close modal
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
        alert('❌ Format salah! Gunakan: username|email|password|totp');
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
        const response = await fetch(`${API_URL}/accounts/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to update account');
        }
        
        alert('✅ Akun berhasil diupdate!');
        loadData();
    } catch (error) {
        console.error('Error updating account:', error);
        alert('❌ Gagal mengupdate akun: ' + error.message);
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
        const response = await fetch(`${API_URL}/accounts/${id}`, {
            method: 'DELETE'
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to delete account');
        }
        
        alert('✅ Akun berhasil dihapus!');
        loadData();
    } catch (error) {
        console.error('Error deleting account:', error);
        alert('❌ Gagal menghapus akun: ' + error.message);
    }
}

// ============ REFRESH ============
function refreshData() {
    loadData();
}

// ============ INIT ============
document.addEventListener('DOMContentLoaded', loadData);
