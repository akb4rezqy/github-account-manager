const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// ✅ PERBAIKAN: Gunakan path.join untuk static files
app.use(express.static(path.join(__dirname, 'public')));

// ✅ PERBAIKAN: Route utama untuk menangani semua request ke /
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ✅ PERBAIKAN: Fallback untuk SPA (Single Page Application)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ============ SCHEMA ============
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

accountSchema.virtual('days').get(function() {
    return Math.floor((Date.now() - this.created_at) / (1000 * 60 * 60 * 24));
});
accountSchema.set('toJSON', { virtuals: true });

const Account = mongoose.model('Account', accountSchema);

// ============ API ROUTES ============

// GET semua akun
app.get('/api/accounts', async (req, res) => {
    try {
        const accounts = await Account.find().sort({ created_at: -1 });
        res.json(accounts);
    } catch (error) {
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

        res.json({ total, available_3d, available_7d, sold, personal });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST tambah akun
app.post('/api/accounts', async (req, res) => {
    try {
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
        res.status(201).json(account);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST bulk
app.post('/api/accounts/bulk', async (req, res) => {
    try {
        const { accounts } = req.body;
        if (!accounts || !Array.isArray(accounts)) {
            return res.status(400).json({ error: 'Data tidak valid' });
        }
        const created = [];
        for (const acc of accounts) {
            if (acc.username && acc.password) {
                const account = new Account({
                    email: acc.email || '',
                    username: acc.username.trim(),
                    password: acc.password.trim(),
                    totp: acc.totp || '',
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
        res.status(500).json({ error: error.message });
    }
});

// PUT bulk status
app.put('/api/accounts/bulk/status', async (req, res) => {
    try {
        const { ids, status } = req.body;
        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ error: 'ID tidak valid' });
        }
        const result = await Account.updateMany(
            { _id: { $in: ids } },
            { status }
        );
        res.json({ 
            message: `Berhasil update ${result.modifiedCount} akun`,
            modified: result.modifiedCount 
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// PUT update account
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
        if (!account) return res.status(404).json({ error: 'Akun tidak ditemukan' });
        res.json(account);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// DELETE account
app.delete('/api/accounts/:id', async (req, res) => {
    try {
        const account = await Account.findByIdAndDelete(req.params.id);
        if (!account) return res.status(404).json({ error: 'Akun tidak ditemukan' });
        res.json({ message: 'Akun berhasil dihapus' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
    });
});

// ============ KONEKSI MONGODB ============
mongoose.connect(process.env.MONGODB_URI)
    .then(() => {
        console.log('✅ Connected to MongoDB Atlas');
        app.listen(PORT, () => {
            console.log(`🚀 Server running on http://localhost:${PORT}`);
            console.log(`📁 Serving static files from: ${path.join(__dirname, 'public')}`);
        });
    })
    .catch(err => {
        console.error('❌ MongoDB connection error:', err);
        console.log('⚠️  Server tetap berjalan tanpa database...');
        app.listen(PORT, () => {
            console.log(`🚀 Server running (without DB) on http://localhost:${PORT}`);
        });
    });
