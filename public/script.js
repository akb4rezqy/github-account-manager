const API_URL = window.location.origin + '/api';
let allAccounts = [];
let selectedAccounts = new Set();

// ============ LOAD DATA ============
async function loadData() {
    try {
        await Promise.all([loadAccounts(), loadStatistics()]);
    } catch (error) {
        console.error('Error loading data:', error);
        showNotification('❌ Gagal memuat data', 'error');
    }
}

async function loadAccounts() {
    try {
        const response = await fetch(`${API_URL}/accounts`);
        if (!response.ok) throw new Error('Failed to fetch');
        allAccounts = await response.json();
        renderAccounts(allAccounts);
    } catch (error) {
        console.error('Error:', error);
        showNotification('❌ Gagal memuat akun', 'error');
    }
}

async function loadStatistics() {
    try {
        const response = await fetch(`${API_URL}/statistics`);
        if (!response.ok) throw new Error('Failed to fetch');
        const stats = await response.json();
        document.getElementById('total').textContent = stats.total || 0;
        document.getElementById('available_3d').textContent = stats.available_3d || 0;
        document.getElementById('available_7d').textContent = stats.available_7d || 0;
        document.getElementById('sold').textContent = stats.sold || 0;
        document.getElementById('personal').textContent = stats.personal || 0;
    } catch (error) {
        console.error('Error:', error);
    }
}

// ============ RENDER ACCOUNTS ============
function renderAccounts(accounts) {
    const tbody = document.getElementById('accountTableBody');
    
    if (!accounts || accounts.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="text-center py-10 text-gray-500">Belum ada akun</td></tr>`;
        return;
    }

    tbody.innerHTML = accounts.map(acc => {
        const statusLabel = acc.status === 'available' ? 'Tersedia' :
                           acc.status === 'available_3d' ? '3 Hari' :
                           acc.status === 'sold' ? 'Terjual' : 'Pribadi';
        const date = new Date(acc.created_at).toLocaleString('id-ID');
        const days = Math.floor((Date.now() - new Date(acc.created_at)) / (1000 * 60 * 60 * 24));
        
        return `
            <tr class="hover:bg-gray-50">
                <td class="px-4 py-3"><input type="checkbox" class="account-checkbox" value="${acc._id}" onchange="toggleAccount('${acc._id}')"></td>
                <td class="px-4 py-3 text-sm">#${acc._id.slice(-6)}</td>
                <td class="px-4 py-3 font-medium">${acc.username}</td>
                <td class="px-4 py-3 text-sm">${acc.email || '-'}</td>
                <td class="px-4 py-3 text-sm">${days} hari</td>
                <td class="px-4 py-3 text-sm">${date}</td>
                <td class="px-4 py-3"><span class="status-badge status-gray">${statusLabel}</span></td>
                <td class="px-4 py-3">
                    <button onclick="showDetail('${acc._id}')" class="btn-action btn-detail">Detail</button>
                    <button onclick="editAccount('${acc._id}')" class="btn-action btn-edit">Edit</button>
                    <button onclick="deleteAccount('${acc._id}')" class="btn-action btn-delete">Hapus</button>
                </td>
            </tr>
        `;
    }).join('');
}

// ============ FILTER ============
function filterAccounts() {
    const search = document.getElementById('searchInput').value.toLowerCase();
    const status = document.getElementById('statusFilter').value;
    let filtered = allAccounts;
    if (search) filtered = filtered.filter(a => a.username.toLowerCase().includes(search) || (a.email && a.email.toLowerCase().includes(search)));
    if (status !== 'all') filtered = filtered.filter(a => a.status === status);
    renderAccounts(filtered);
}

// ============ TOGGLE FORM ============
function toggleForm(form) {
    ['add', 'bulk', 'ambil', 'status'].forEach(f => {
        document.getElementById(f + 'Form').classList.add('hidden');
    });
    if (form) {
        document.getElementById(form + 'Form').classList.remove('hidden');
        if (form === 'ambil') loadAmbilList();
        if (form === 'status') loadStatusList();
    }
}

// ============ ADD ACCOUNT ============
document.getElementById('addAccountForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const totp = document.getElementById('totp').value;
    
    if (!username || !password) {
        showNotification('Username dan password wajib diisi!', 'error');
        return;
    }
    
    try {
        const response = await fetch(`${API_URL}/accounts`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, username, password, totp })
        });
        if (!response.ok) throw new Error('Gagal menambahkan');
        showNotification('✅ Akun berhasil ditambahkan!', 'success');
        document.getElementById('addAccountForm').reset();
        toggleForm('add');
        loadData();
    } catch (error) {
        showNotification('❌ ' + error.message, 'error');
    }
});

// ============ BULK ADD ============
async function submitBulk() {
    const data = document.getElementById('bulkData').value;
    const lines = data.split('\n').filter(l => l.trim());
    if (lines.length === 0) {
        showNotification('Masukkan data akun!', 'error');
        return;
    }
    
    const accounts = lines.map(line => {
        const parts = line.split(':').map(p => p.trim());
        if (parts.length === 3) return { email: '', username: parts[0], password: parts[1], totp: parts[2] };
        if (parts.length === 4) return { email: parts[0], username: parts[1], password: parts[2], totp: parts[3] };
        return null;
    }).filter(a => a && a.username && a.password);
    
    if (accounts.length === 0) {
        showNotification('Format salah! Gunakan: email:username:password:totp', 'error');
        return;
    }
    
    try {
        const response = await fetch(`${API_URL}/accounts/bulk`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ accounts })
        });
        if (!response.ok) throw new Error('Gagal menambahkan');
        const result = await response.json();
        showNotification(`✅ ${result.message}`, 'success');
        document.getElementById('bulkData').value = '';
        toggleForm('bulk');
        loadData();
    } catch (error) {
        showNotification('❌ ' + error.message, 'error');
    }
}

// ============ AMBIL AKUN ============
function loadAmbilList() {
    const list = document.getElementById('ambilAccountList');
    const available = allAccounts.filter(a => a.status === 'available' || a.status === 'available_3d');
    if (available.length === 0) {
        list.innerHTML = '<p class="text-gray-500 p-4">Tidak ada akun tersedia</p>';
        return;
    }
    list.innerHTML = available.map(a => {
        const statusLabel = a.status === 'available' ? 'Tersedia' : '3 Hari';
        return `
            <div class="flex items-center gap-3 p-2 border-b hover:bg-gray-50">
                <input type="checkbox" class="ambil-checkbox" value="${a._id}" onchange="toggleAmbil('${a._id}')">
                <span class="font-medium">${a.username}</span>
                <span class="text-sm text-gray-500">${a.email || '-'}</span>
                <span class="status-badge status-gray">${statusLabel}</span>
                <span class="text-sm text-gray-400">${Math.floor((Date.now() - new Date(a.created_at)) / (1000 * 60 * 60 * 24))} hari</span>
            </div>
        `;
    }).join('');
    window.ambilSelected = new Set();
}

function toggleAmbil(id) {
    if (window.ambilSelected.has(id)) window.ambilSelected.delete(id);
    else window.ambilSelected.add(id);
}

async function ambilAkun() {
    const ids = Array.from(window.ambilSelected || []);
    if (ids.length === 0) {
        showNotification('Pilih minimal 1 akun!', 'error');
        return;
    }
    
    const accounts = allAccounts.filter(a => ids.includes(a._id));
    const text = accounts.map(a => `${a.email || ''}:${a.username}:${a.password}:${a.totp || ''}`).join('\n');
    
    if (confirm(`${accounts.length} akun siap diambil.\nOK = Salin clipboard\nCancel = Download TXT`)) {
        try {
            await navigator.clipboard.writeText(text);
            showNotification(`✅ ${accounts.length} akun disalin!`, 'success');
        } catch {
            const ta = document.createElement('textarea');
            ta.value = text;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            showNotification(`✅ ${accounts.length} akun disalin!`, 'success');
        }
    } else {
        const blob = new Blob([text], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `akun_${new Date().toISOString().slice(0,10)}.txt`;
        a.click();
        URL.revokeObjectURL(url);
        showNotification(`✅ ${accounts.length} akun di-download!`, 'success');
    }
    
    await updateStatusBulk(ids, 'sold');
    toggleForm('ambil');
    loadData();
}

// ============ BULK STATUS ============
function loadStatusList() {
    const list = document.getElementById('statusAccountList');
    if (allAccounts.length === 0) {
        list.innerHTML = '<p class="text-gray-500 p-4">Belum ada akun</p>';
        return;
    }
    list.innerHTML = allAccounts.map(a => {
        const statusLabel = a.status === 'available' ? 'Tersedia' :
                           a.status === 'available_3d' ? '3 Hari' :
                           a.status === 'sold' ? 'Terjual' : 'Pribadi';
        return `
            <div class="flex items-center gap-3 p-2 border-b hover:bg-gray-50">
                <input type="checkbox" class="status-checkbox" value="${a._id}" onchange="toggleStatus('${a._id}')">
                <span class="font-medium">${a.username}</span>
                <span class="text-sm text-gray-500">${a.email || '-'}</span>
                <span class="status-badge status-gray">${statusLabel}</span>
            </div>
        `;
    }).join('');
    window.statusSelected = new Set();
}

function toggleStatus(id) {
    if (window.statusSelected.has(id)) window.statusSelected.delete(id);
    else window.statusSelected.add(id);
}

async function updateBulkStatus(status) {
    const ids = Array.from(window.statusSelected || []);
    if (ids.length === 0) {
        showNotification('Pilih minimal 1 akun!', 'error');
        return;
    }
    
    try {
        const response = await fetch(`${API_URL}/accounts/bulk/status`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids, status })
        });
        if (!response.ok) throw new Error('Gagal update');
        const result = await response.json();
        showNotification(`✅ ${result.message}`, 'success');
        toggleForm('status');
        loadData();
    } catch (error) {
        showNotification('❌ ' + error.message, 'error');
    }
}

// ============ DETAIL ============
function showDetail(id) {
    const acc = allAccounts.find(a => a._id === id);
    if (!acc) return;
    
    const statusLabel = acc.status === 'available' ? 'Tersedia' :
                       acc.status === 'available_3d' ? '3 Hari' :
                       acc.status === 'sold' ? 'Terjual' : 'Pribadi';
    
    document.getElementById('modalTitle').textContent = `Detail - ${acc.username}`;
    document.getElementById('modalBody').innerHTML = `
        <div class="space-y-2">
            <p><strong>ID:</strong> ${acc._id}</p>
            <p><strong>Username:</strong> ${acc.username}</p>
            <p><strong>Email:</strong> ${acc.email || '-'}</p>
            <p><strong>Password:</strong> <code class="bg-gray-100 px-2 py-1 rounded">${acc.password}</code></p>
            <p><strong>TOTP:</strong> ${acc.totp || '-'}</p>
            <p><strong>Status:</strong> <span class="status-badge status-gray">${statusLabel}</span></p>
            <p><strong>Umur:</strong> ${Math.floor((Date.now() - new Date(acc.created_at)) / (1000 * 60 * 60 * 24))} hari</p>
            <p><strong>Ditambahkan:</strong> ${new Date(acc.created_at).toLocaleString('id-ID')}</p>
        </div>
    `;
    document.getElementById('accountModal').classList.remove('hidden');
}

function closeModal() {
    document.getElementById('accountModal').classList.add('hidden');
}

function closeModalOutside(e) {
    if (e.target === e.currentTarget) closeModal();
}

// ============ EDIT ============
function editAccount(id) {
    const acc = allAccounts.find(a => a._id === id);
    if (!acc) return;
    const newUser = prompt('Username baru:', acc.username);
    if (newUser && newUser !== acc.username) {
        updateAccount(id, { username: newUser });
    }
}

async function updateAccount(id, data) {
    try {
        const response = await fetch(`${API_URL}/accounts/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        if (!response.ok) throw new Error('Gagal update');
        showNotification('✅ Akun diupdate!', 'success');
        loadData();
    } catch (error) {
        showNotification('❌ ' + error.message, 'error');
    }
}

// ============ DELETE ============
async function deleteAccount(id) {
    const acc = allAccounts.find(a => a._id === id);
    if (!acc || !confirm(`Hapus "${acc.username}"?`)) return;
    try {
        const response = await fetch(`${API_URL}/accounts/${id}`, {
            method: 'DELETE'
        });
        if (!response.ok) throw new Error('Gagal hapus');
        showNotification('✅ Akun dihapus!', 'success');
        loadData();
    } catch (error) {
        showNotification('❌ ' + error.message, 'error');
    }
}

// ============ SELECT ALL ============
function toggleSelectAll() {
    const checked = document.getElementById('selectAll').checked;
    document.querySelectorAll('.account-checkbox').forEach(cb => {
        cb.checked = checked;
        if (checked) selectedAccounts.add(cb.value);
        else selectedAccounts.delete(cb.value);
    });
}

function toggleAccount(id) {
    if (selectedAccounts.has(id)) selectedAccounts.delete(id);
    else selectedAccounts.add(id);
}

// ============ NOTIFICATION ============
function showNotification(msg, type = 'info') {
    const existing = document.querySelector('.notification');
    if (existing) existing.remove();
    const div = document.createElement('div');
    div.className = `notification ${type}`;
    div.innerHTML = `${msg} <button onclick="this.parentElement.remove()" class="ml-4 text-xl">&times;</button>`;
    document.body.appendChild(div);
    setTimeout(() => div.remove(), 5000);
}

// ============ SESSION ============
async function logout() {
    try {
        await fetch(`${API_URL}/logout`, { method: 'POST', credentials: 'include' });
    } finally {
        window.location.href = '/login';
    }
}

// ============ REFRESH ============
function refreshData() { loadData(); }

// ============ INIT ============
document.addEventListener('DOMContentLoaded', loadData);
