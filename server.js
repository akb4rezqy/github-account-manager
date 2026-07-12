const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// MongoDB Schema
const accountSchema = new mongoose.Schema({
    email: { type: String, default: '' },
    username: { type: String, required: true },
    password: { type: String, required: true },
    totp: { type: String, default: '' },
    status: { 
        type: String, 
        enum: ['available', 'sold', 'personal'],
        default: 'available'
    },
    created_at: { type: Date, default: Date.now }
});

// Virtual untuk menghitung umur akun
accountSchema.virtual('days').get(function() {
    const now = new Date();
    const diff = now - this.created_at;
    return Math.floor(diff / (1000 * 60 * 60 * 24));
});

accountSchema.set('toJSON', { virtuals: true });
accountSchema.set('toObject', { virtuals: true });

const Account = mongoose.model('Account', accountSchema);

// ============ ROUTES ============

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
            status: 'available',
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
        res.status(500).json({ error: error.message });
    }
});

// POST tambah akun
app.post('/api/accounts', async (req, res) => {
    try {
        const { email, username, password, totp } = req.body;
        
        // Validasi
        if (!username || !password) {
            return res.status(400).json({ error: 'Username dan password wajib diisi' });
        }

        const account = new Account({
            email: email || '',
            username,
            password,
            totp: totp || ''
        });

        await account.save();
        res.status(201).json(account);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST tambah multiple akun (dari text area)
app.post('/api/accounts/bulk', async (req, res) => {
    try {
        const { accounts } = req.body;
        
        if (!accounts || !Array.isArray(accounts)) {
            return res.status(400).json({ error: 'Data tidak valid' });
        }

        const created = [];
        for (const acc of accounts) {
            const { email, username, password, totp } = acc;
            if (username && password) {
                const account = new Account({
                    email: email || '',
                    username,
                    password,
                    totp: totp || ''
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
        res.status(500).json({ error: error.message });
    }
});

// PUT update status (bulk)
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
        res.status(500).json({ error: error.message });
    }
});

// Koneksi MongoDB
mongoose.connect(process.env.MONGODB_URI)
    .then(() => {
        console.log('✅ Connected to MongoDB');
        app.listen(process.env.PORT || 3000, () => {
            console.log(`🚀 Server running on http://localhost:${process.env.PORT || 3000}`);
        });
    })
    .catch(err => {
        console.error('❌ MongoDB connection error:', err);
        process.exit(1);
    });
