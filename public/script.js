const API_URL = 'http://localhost:3000/api';
let allAccounts = [];
let selectedAccounts = new Set();

// ============ LOAD DATA ============
async function loadData() {
    try {
        await Promise.all([loadAccounts(), loadStatistics()]);
    } catch (error) {
        console.error('Error loading data:', error);
        alert('Gagal memuat data. Pastikan server berjalan.');
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
        const statusLabel = account.status === 'available' ? 'Tersedia' :
                           account.status === 'sold' ? 'Terjual' : 'Pribadi';
        
        return `
            <tr>
                <td>
                    <input type="checkbox" class="account-checkbox" 
                           value="${account._id}" onchange="toggleAccount('${account._id}')">
                </td>
                <td>#${account._id.slice(-6)}</td>
                <td><strong>${account.username}</strong></td>
                <td>${account.email || '-'}</td>
                <td>${account.days || 0} hari</td>
                <td><span class="status-badge ${statusClass}">${statusLabel}</span></td>
                <td>
                    <button class="btn-action btn-detail" onclick="showDetail('${account._id}')">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button class="btn-action btn-edit" onclick="editAccount('${account._id}')">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn-action btn-delete" onclick="deleteAccount('${account._id}')">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
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
        alert('Username dan password wajib diisi!');
        return;
    }
    
    try {
        const response = await fetch(`${API_URL}/accounts`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, username, password, totp })
        });
        
        if (!response.ok) throw new Error('Failed to add account');
        
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
        alert('Masukkan data akun!');
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
        alert('Format data salah! Gunakan: email:username:password:totp');
        return;
    }
    
    if (!confirm(`Tambahkan ${accounts.length} akun?`)) return;
    
    try {
        const response = await fetch(`${API_URL}/accounts/bulk`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ accounts })
        });
        
        if (!response.ok) throw new Error('Failed to add accounts');
        
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
    list.innerHTML = allAccounts.map(acc => `
        <div style="padding: 8px; border-bottom: 1px solid #eee;">
            <input type="checkbox" class="status-checkbox" value="${acc._id}" 
                   onchange="toggleStatusAccount('${acc._id}')">
            <strong>${acc.username}</strong> 
            (${acc.email || '-'}) - 
            <span class="status-badge ${acc.status === 'available' ? 'status-available' : acc.status === 'sold' ? 'status-sold' : 'status-personal'}">
                ${acc.status === 'available' ? 'Tersedia' : acc.status === 'sold' ? 'Terjual' : 'Pribadi'}
            </span>
        </div>
    `).join('');
    
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
        alert('Pilih minimal 1 akun!');
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
        
        if (!response.ok) throw new Error('Failed to update status');
        
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
    if (!account) return;
    
    const modal = document.getElementById('accountModal');
    const body = document.getElementById('modalBody');
    
    body.innerHTML = `
        <div style="padding: 10px 0;">
            <p><strong>ID:</strong> ${account._id}</p>
            <p><strong>Username:</strong> ${account.username}</p>
            <p><strong>Email:</strong> ${account.email || '-'}</p>
            <p><strong>Password:</strong> <code>${account.password}</code></p>
            <p><strong>TOTP:</strong> ${account.totp || '-'}</p>
            <p><strong>Status:</strong> ${account.status}</p>
            <p><strong>Umur:</strong> ${account.days || 0} hari</p>
            <p><strong>Dibuat:</strong> ${new Date(account.created_at).toLocaleString()}</p>
        </div>
    `;
    
    modal.classList.remove('hidden');
}

function closeModal() {
    document.getElementById('accountModal').classList.add('hidden');
}

// ============ EDIT ACCOUNT ============
function editAccount(id) {
    const account = allAccounts.find(a => a._id === id);
    if (!account) return;
    
    const newUsername = prompt('Username baru:', account.username);
    if (newUsername !== null && newUsername !== account.username) {
        updateAccount(id, { username: newUsername });
    }
}

async function updateAccount(id, data) {
    try {
        const response = await fetch(`${API_URL}/accounts/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        
        if (!response.ok) throw new Error('Failed to update account');
        
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
    
    if (!confirm(`Hapus akun "${account.username}"?`)) return;
    
    try {
        const response = await fetch(`${API_URL}/accounts/${id}`, {
            method: 'DELETE'
        });
        
        if (!response.ok) throw new Error('Failed to delete account');
        
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

// Click outside modal to close
document.getElementById('accountModal').addEventListener('click', function(e) {
    if (e.target === this) closeModal();
});
