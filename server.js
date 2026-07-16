const API_URL = window.location.origin + '/api';
let allAccounts = [];
let selectedAccounts = new Set();

// ============ CHECK AUTH ============
async function checkAuth() {
    try {
        console.log('🔍 Checking auth...');
        const response = await fetch('/api/check-auth', {
            method: 'GET',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'no-cache, no-store, must-revalidate'
            }
        });
        
        if (!response.ok) {
            console.error('❌ Auth check failed:', response.status);
            return { authenticated: false };
        }
        
        const data = await response.json();
        console.log('✅ Auth response:', data);
        
        if (!data.authenticated) {
            console.log('🔒 Not authenticated, redirecting to login...');
            window.location.href = '/login.html';
            return { authenticated: false };
        }
        
        if (data.user) {
            const userDisplay = document.getElementById('userDisplay');
            if (userDisplay) {
                userDisplay.textContent = `👤 ${data.user.username}`;
            }
        }
        
        return data;
    } catch (error) {
        console.error('❌ Auth check error:', error);
        window.location.href = '/login.html';
        return { authenticated: false };
    }
}

// ============ LOGOUT ============
async function logout() {
    if (!confirm('Yakin ingin logout?')) return;
    try {
        const response = await fetch('/api/logout', { 
            method: 'POST',
            credentials: 'include'
        });
        if (response.ok) {
            window.location.href = '/login.html';
        }
    } catch (error) {
        console.error('Logout failed:', error);
        showNotification('❌ Gagal logout', 'error');
    }
}

// ============ LOAD DATA ============
async function loadData() {
    try {
        console.log('📊 Loading data...');
        
        // ✅ Load sequential
        await loadAccounts();
        await loadStatistics();
        
        console.log('✅ All data loaded successfully');
    } catch (error) {
        console.error('Error loading data:', error);
        showNotification('❌ Gagal memuat data: ' + error.message, 'error');
    }
}

async function loadAccounts() {
    try {
        console.log('📊 Loading accounts...');
        const response = await fetch(`${API_URL}/accounts`, {
            credentials: 'include',
            headers: {
                'Cache-Control': 'no-cache, no-store, must-revalidate'
            }
        });
        
        if (!response.ok) {
            if (response.status === 401) {
                window.location.href = '/login.html';
                return;
            }
            throw new Error('Failed to fetch accounts');
        }
        
        allAccounts = await response.json();
        console.log(`✅ Loaded ${allAccounts.length} accounts`);
        renderAccounts(allAccounts);
    } catch (error) {
        console.error('Error loading accounts:', error);
        showNotification('❌ Gagal memuat akun', 'error');
        renderAccounts([]);
    }
}

async function loadStatistics() {
    try {
        console.log('📊 Loading statistics...');
        const response = await fetch(`${API_URL}/statistics`, {
            credentials: 'include'
        });
        
        if (!response.ok) {
            if (response.status === 401) {
                window.location.href = '/login.html';
                return;
            }
            throw new Error('Failed to fetch statistics');
        }
        
        const stats = await response.json();
        console.log('✅ Statistics loaded:', stats);
        
        // ✅ Update dengan aman
        const elements = {
            total: document.getElementById('total'),
            available_3d: document.getElementById('available_3d'),
            available_7d: document.getElementById('available_7d'),
            sold: document.getElementById('sold'),
            personal: document.getElementById('personal')
        };
        
        if (elements.total) elements.total.textContent = stats.total || 0;
        if (elements.available_3d) elements.available_3d.textContent = stats.available_3d || 0;
        if (elements.available_7d) elements.available_7d.textContent = stats.available_7d || 0;
        if (elements.sold) elements.sold.textContent = stats.sold || 0;
        if (elements.personal) elements.personal.textContent = stats.personal || 0;
        
    } catch (error) {
        console.error('Error loading statistics:', error);
        ['total', 'available_3d', 'available_7d', 'sold', 'personal'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.textContent = '0';
        });
    }
}

// ============ RENDER ACCOUNTS ============
function renderAccounts(accounts) {
    const tbody = document.getElementById('accountTableBody');
    if (!tbody) {
        console.warn('⚠️ accountTableBody not found');
        return;
    }
    
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
    const search = document.getElementById('searchInput');
    const statusFilter = document.getElementById('statusFilter');
    
    if (!search || !statusFilter) return;
    
    const searchTerm = search.value.toLowerCase();
    const status = statusFilter.value;
    
    let filtered = allAccounts;
    if (searchTerm) filtered = filtered.filter(a => a.username.toLowerCase().includes(searchTerm) || (a.email && a.email.toLowerCase().includes(searchTerm)));
    if (status !== 'all') filtered = filtered.filter(a => a.status === status);
    renderAccounts(filtered);
}

// ============ TOGGLE FORM ============
function toggleForm(form) {
    ['add', 'bulk', 'ambil', 'status'].forEach(f => {
        const el = document.getElementById(f + 'Form');
        if (el) el.classList.add('hidden');
    });
    if (form) {
        const el = document.getElementById(form + 'Form');
        if (el) {
            el.classList.remove('hidden');
            if (form === 'ambil') loadAmbilList();
            if (form === 'status') loadStatusList();
        }
    }
}

// ============ ADD ACCOUNT ============
document.getElementById('addAccountForm')?.addEventListener('submit', async (e) => {
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
            body: JSON.stringify({ email, username, password, totp }),
            credentials: 'include'
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
            body: JSON.stringify({ accounts }),
            credentials: 'include'
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
    if (!list) return;
    
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
    if (!list) return;
    
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
            body: JSON.stringify({ ids, status }),
            credentials: 'include'
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
            body: JSON.stringify(data),
            credentials: 'include'
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
            method: 'DELETE',
            credentials: 'include'
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

// ============ REFRESH ============
function refreshData() { 
    console.log('🔄 Refresh triggered');
    loadData(); 
}

// ============ INIT ============
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 Page loaded, checking auth...');
    
    try {
        const auth = await checkAuth();
        console.log('📡 Auth result:', auth);
        
        if (!auth || !auth.authenticated) {
            console.log('🔒 Not authenticated, redirecting...');
            return;
        }
        
        console.log('📊 Loading dashboard data...');
        await loadData();
        console.log('✅ Dashboard loaded successfully');
        
    } catch (error) {
        console.error('❌ Fatal error:', error);
        document.body.innerHTML = `
            <div style="display:flex;align-items:center;justify-content:center;height:100vh;flex-direction:column;gap:20px;padding:20px;text-align:center;">
                <h1 style="font-size:24px;color:#1a1a1a;">⚠️ Terjadi Kesalahan</h1>
                <p style="color:#666;max-width:400px;">${error.message || 'Gagal memuat halaman. Silakan refresh atau coba lagi nanti.'}</p>
                <button onclick="location.reload()" style="padding:12px 24px;background:#1a1a1a;color:white;border:none;border-radius:8px;cursor:pointer;font-weight:600;">
                    <i class="fas fa-sync"></i> Refresh Halaman
                </button>
                <button onclick="window.location.href='/login.html'" style="padding:12px 24px;background:transparent;color:#1a1a1a;border:1px solid #ccc;border-radius:8px;cursor:pointer;font-weight:600;">
                    <i class="fas fa-sign-in-alt"></i> Ke Halaman Login
                </button>
            </div>
        `;
    }
});

// ============ ESC KEY ============
document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape') {
        closeModal();
    }
});
