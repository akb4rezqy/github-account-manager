const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const { createSessionToken, verifySessionToken, parseCookies } = require('./auth');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// CORS
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const isProduction = process.env.NODE_ENV === 'production';
const COOKIE_NAME = 'stock_session';
const sessionSecret = process.env.SESSION_SECRET || '';
const adminUsername = process.env.ADMIN_USERNAME || '';
const adminPassword = process.env.ADMIN_PASSWORD || '';

function constantTimeEquals(left, right) {
    const leftBuffer = Buffer.from(left || '');
    const rightBuffer = Buffer.from(right || '');
    return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function getSession(req) {
    return verifySessionToken(parseCookies(req.headers.cookie)[COOKIE_NAME], sessionSecret);
}

function requireAuth(req, res, next) {
    if (getSession(req)) return next();
    if (req.originalUrl.startsWith('/api/')) return res.status(401).json({ error: 'Unauthorized' });
    return res.redirect('/login');
}

app.get('/login', (req, res) => {
    if (getSession(req)) return res.redirect('/');
    return res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.post('/api/login', (req, res) => {
    if (!sessionSecret || !adminUsername || !adminPassword) {
        return res.status(503).json({ error: 'Login is not configured' });
    }

    const username = typeof req.body.username === 'string' ? req.body.username.trim() : '';
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    if (!constantTimeEquals(username, adminUsername) || !constantTimeEquals(password, adminPassword)) {
        return res.status(401).json({ error: 'Username atau password salah' });
    }

    const token = createSessionToken(adminUsername, sessionSecret);
    res.setHeader('Set-Cookie', `${COOKIE_NAME}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=43200${isProduction ? '; Secure' : ''}`);
    return res.json({ success: true });
});

app.post('/api/logout', (req, res) => {
    res.setHeader('Set-Cookie', `${COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${isProduction ? '; Secure' : ''}`);
    return res.json({ success: true });
});

app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        message: 'Server is running',
        timestamp: new Date().toISOString(),
        mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
    });
});

// All account data APIs require an authenticated session.
app.use('/api', requireAuth);

app.get(['/', '/index.html'], requireAuth, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Assets remain public; sensitive account data is protected by the API guard above.
app.use(express.static(path.join(__dirname, 'public'), { index: false }));

// ============ MONGODB SCHEMA ============
const accountSchema = new mongoose.Schema({
    email: { type: String, default: '' },
    username: { type: String, required: true },
    password: { type: String, required: true },
    totp: { type: String, default: '' },
    status: { 
        type: String, 
        enum: ['available', 'sold', 'personal', 'available_3d'],
        default: 'available'
    },
    created_at: { type: Date, default: Date.now }
});

// Virtual field untuk umur akun
accountSchema.virtual('days').get(function() {
    const now = new Date();
    const diff = now - this.created_at;
    return Math.floor(diff / (1000 * 60 * 60 * 24));
});

accountSchema.set('toJSON', { virtuals: true });
accountSchema.set('toObject', { virtuals: true });

const Account = mongoose.model('Account', accountSchema);

// ============ API ROUTES ============

// GET semua akun
app.get('/api/accounts', async (req, res) => {
    try {
        const accounts = await Account.find().sort({ created_at: -1 });
        res.json(accounts);
    } catch (error) {
        console.error('Error fetching accounts:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET statistik
app.get('/api/statistics', async (req, res) => {
    try {
        const total = await Account.countDocuments();
        const available_3d = await Account.countDocuments({
            status: 'available',
            created_at: { $gte: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) }
        });
        const available_7d = await Account.countDocuments({
            status: { $in: ['available', 'available_3d'] },
            created_at: { $lt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) }
        });
        const sold = await Account.countDocuments({ status: 'sold' });
        const personal = await Account.countDocuments({ status: 'personal' });

        res.json({
            total,
            available_3d,
            available_7d,
            sold,
            personal
        });
    } catch (error) {
        console.error('Error fetching statistics:', error);
        res.status(500).json({ error: error.message });
    }
});

// POST tambah akun (single)
app.post('/api/accounts', async (req, res) => {
    try {
        console.log('📝 Received account data:', req.body);
        
        const { email, username, password, totp } = req.body;
        
        if (!username || !password) {
            return res.status(400).json({ error: 'Username dan password wajib diisi' });
        }

        const account = new Account({
            email: email || '',
            username: username.trim(),
            password: password.trim(),
            totp: totp || '',
            created_at: new Date()
        });

        await account.save();
        console.log('✅ Account saved:', account._id);
        res.status(201).json(account);
    } catch (error) {
        console.error('❌ Error saving account:', error);
        res.status(500).json({ error: error.message });
    }
});

// POST tambah multiple akun (bulk)
app.post('/api/accounts/bulk', async (req, res) => {
    try {
        console.log('📝 Received bulk data:', req.body);
        const { accounts } = req.body;
        
        if (!accounts || !Array.isArray(accounts) || accounts.length === 0) {
            return res.status(400).json({ error: 'Data tidak valid' });
        }

        const created = [];
        for (const acc of accounts) {
            const { email, username, password, totp } = acc;
            if (username && password) {
                const account = new Account({
                    email: email || '',
                    username: username.trim(),
                    password: password.trim(),
                    totp: totp || '',
                    created_at: new Date()
                });
                await account.save();
                created.push(account);
            }
        }

        res.status(201).json({ 
            message: `Berhasil menambahkan ${created.length} akun`,
            accounts: created 
        });
    } catch (error) {
        console.error('❌ Error saving bulk accounts:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============ UPDATE STATUS ============

// PUT update status (bulk)
app.put('/api/accounts/bulk/status', async (req, res) => {
    try {
        console.log('📝 Bulk status update:', req.body);
        const { ids, status } = req.body;
        
        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ error: 'ID tidak valid' });
        }

        if (!['available', 'sold', 'personal', 'available_3d'].includes(status)) {
            return res.status(400).json({ error: 'Status tidak valid' });
        }

        const result = await Account.updateMany(
            { _id: { $in: ids } },
            { status }
        );

        console.log(`✅ Updated ${result.modifiedCount} accounts`);
        res.json({ 
            message: `Berhasil update ${result.modifiedCount} akun`,
            modified: result.modifiedCount 
        });
    } catch (error) {
        console.error('❌ Error updating bulk status:', error);
        res.status(500).json({ error: error.message });
    }
});

// PUT update status (single)
app.put('/api/accounts/:id/status', async (req, res) => {
    try {
        const { status } = req.body;
        const account = await Account.findByIdAndUpdate(
            req.params.id,
            { status },
            { new: true }
        );
        
        if (!account) {
            return res.status(404).json({ error: 'Akun tidak ditemukan' });
        }
        
        res.json(account);
    } catch (error) {
        console.error('Error updating status:', error);
        res.status(500).json({ error: error.message });
    }
});

// PUT update data akun
app.put('/api/accounts/:id', async (req, res) => {
    try {
        const { email, username, password, totp } = req.body;
        const updateData = {};
        
        if (email !== undefined) updateData.email = email;
        if (username !== undefined) updateData.username = username;
        if (password !== undefined) updateData.password = password;
        if (totp !== undefined) updateData.totp = totp;

        const account = await Account.findByIdAndUpdate(
            req.params.id,
            updateData,
            { new: true }
        );
        
        if (!account) {
            return res.status(404).json({ error: 'Akun tidak ditemukan' });
        }
        
        res.json(account);
    } catch (error) {
        console.error('Error updating account:', error);
        res.status(500).json({ error: error.message });
    }
});

// DELETE akun
app.delete('/api/accounts/:id', async (req, res) => {
    try {
        const account = await Account.findByIdAndDelete(req.params.id);
        if (!account) {
            return res.status(404).json({ error: 'Akun tidak ditemukan' });
        }
        res.json({ message: 'Akun berhasil dihapus' });
    } catch (error) {
        console.error('Error deleting account:', error);
        res.status(500).json({ error: error.message });
    }
});

// DELETE semua akun dengan status tertentu
app.delete('/api/accounts/bulk', async (req, res) => {
    try {
        const { status } = req.body;
        const result = await Account.deleteMany({ status });
        res.json({ 
            message: `Berhasil menghapus ${result.deletedCount} akun`,
            deleted: result.deletedCount 
        });
    } catch (error) {
        console.error('Error deleting bulk accounts:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============ KONEKSI MONGODB ATLAS ============
console.log('🔄 Connecting to MongoDB Atlas...');

mongoose.connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 10000,
    socketTimeoutMS: 45000,
})
.then(() => {
    console.log('✅ Connected to MongoDB Atlas');
    console.log(`📊 Database: ${mongoose.connection.db.databaseName}`);
    
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`🚀 Server running on http://localhost:${PORT}`);
        console.log(`📱 Open browser: http://localhost:${PORT}`);
    });
})
.catch(err => {
    console.error('❌ MongoDB connection error:', err);
    console.log('\n⚠️  Server tetap berjalan tanpa database...');
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`🚀 Server running (without DB) on http://localhost:${PORT}`);
    });
});

process.on('unhandledRejection', (err) => {
    console.error('Unhandled Rejection:', err);
});
