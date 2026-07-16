const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const session = require('express-session');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// ============ SECURITY HEADERS ============
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.tailwindcss.com", "https://cdnjs.cloudflare.com"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.tailwindcss.com", "https://cdnjs.cloudflare.com"],
            fontSrc: ["'self'", "https://cdnjs.cloudflare.com"],
            imgSrc: ["'self'", "data:"],
        },
    },
    crossOriginEmbedderPolicy: false,
}));

// ============ RATE LIMITING ============
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 attempts
    message: { error: 'Terlalu banyak percobaan login. Coba lagi setelah 15 menit.' },
    standardHeaders: true,
    legacyHeaders: false,
});

const apiLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 100, // 100 requests
    message: { error: 'Terlalu banyak request. Coba lagi nanti.' },
});

// ============ SESSION ============
app.use(session({
    secret: process.env.SESSION_SECRET || 'your-secret-key-min-32-chars',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,  // Mencegah XSS
        sameSite: 'strict',  // Mencegah CSRF
        maxAge: 24 * 60 * 60 * 1000
    },
    name: 'sessionId' // Ganti default connect.sid
}));

// ============ MIDDLEWARE ============
app.use(cors({
    origin: process.env.NODE_ENV === 'production' 
        ? ['https://your-domain.com'] 
        : ['http://localhost:3000', 'http://localhost:5173'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Apply rate limiting ke semua API
app.use('/api/', apiLimiter);

// ============ AUTH MIDDLEWARE ============
function isAuthenticated(req, res, next) {
    if (req.session.user) {
        return next();
    }
    if (!req.path.startsWith('/api/')) {
        return res.redirect('/login.html');
    }
    res.status(401).json({ error: 'Unauthorized' });
}

// ============ ROUTES ============

// Login page
app.get('/login.html', (req, res) => {
    if (req.session.user) {
        return res.redirect('/');
    }
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Login API - dengan rate limiting + validation
app.post('/api/login', loginLimiter, [
    body('username').trim().isLength({ min: 3, max: 50 }).escape(),
    body('password').trim().isLength({ min: 3, max: 100 }).escape()
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ error: 'Input tidak valid' });
        }

        const { username, password } = req.body;
        const validUsername = process.env.ADMIN_USERNAME || 'admin';
        const validPasswordHash = process.env.ADMIN_PASSWORD_HASH;

        if (!validPasswordHash) {
            console.error('❌ Password hash not set in .env');
            return res.status(500).json({ error: 'Server configuration error' });
        }

        // Check username
        if (username !== validUsername) {
            return res.status(401).json({ error: 'Username atau password salah' });
        }

        // Check password dengan bcrypt
        const isValidPassword = await bcrypt.compare(password, validPasswordHash);
        if (!isValidPassword) {
            return res.status(401).json({ error: 'Username atau password salah' });
        }

        // Regenerate session untuk prevent session fixation
        req.session.regenerate((err) => {
            if (err) {
                console.error('Session regenerate error:', err);
                return res.status(500).json({ error: 'Server error' });
            }
            req.session.user = { username, loginTime: Date.now() };
            req.session.save();
            res.json({ success: true, message: 'Login berhasil' });
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Terjadi kesalahan server' });
    }
});

// Logout API
app.post('/api/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Logout error:', err);
            return res.status(500).json({ error: 'Logout gagal' });
        }
        res.clearCookie('sessionId');
        res.json({ success: true });
    });
});

// Check session
app.get('/api/check-auth', (req, res) => {
    if (req.session.user) {
        res.json({ authenticated: true, user: { username: req.session.user.username } });
    } else {
        res.json({ authenticated: false });
    }
});

// ============ PROTECTED STATIC ROUTES ============
app.get('/', isAuthenticated, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('*.css', isAuthenticated, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', req.path));
});

app.get('*.js', isAuthenticated, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', req.path));
});

// ============ MONGODB SCHEMA ============
const accountSchema = new mongoose.Schema({
    email: { type: String, default: '', trim: true, lowercase: true },
    username: { type: String, required: true, trim: true },
    password: { type: String, required: true, trim: true },
    totp: { type: String, default: '', trim: true },
    status: {
        type: String,
        enum: ['available', 'sold', 'personal', 'available_3d'],
        default: 'available'
    },
    created_at: { type: Date, default: Date.now }
});

accountSchema.virtual('days').get(function() {
    const now = new Date();
    const diff = now - this.created_at;
    return Math.floor(diff / (1000 * 60 * 60 * 24));
});

accountSchema.set('toJSON', { virtuals: true });
accountSchema.set('toObject', { virtuals: true });

const Account = mongoose.model('Account', accountSchema);

// ============ API ROUTES ============
app.use('/api/accounts', isAuthenticated);
app.use('/api/statistics', isAuthenticated);

app.get('/api/health', isAuthenticated, (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
        uptime: process.uptime()
    });
});

// GET semua akun
app.get('/api/accounts', async (req, res) => {
    try {
        const accounts = await Account.find().sort({ created_at: -1 });
        res.json(accounts);
    } catch (error) {
        console.error('Error fetching accounts:', error);
        res.status(500).json({ error: 'Gagal mengambil data' });
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
        console.error('Error fetching statistics:', error);
        res.status(500).json({ error: 'Gagal mengambil statistik' });
    }
});

// POST tambah akun
app.post('/api/accounts', [
    body('email').optional().isEmail().normalizeEmail(),
    body('username').trim().isLength({ min: 1, max: 100 }),
    body('password').trim().isLength({ min: 1, max: 100 }),
    body('totp').optional().trim().isLength({ max: 50 })
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ error: 'Data tidak valid' });
        }

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
        res.status(500).json({ error: 'Gagal menyimpan akun' });
    }
});

// POST bulk
app.post('/api/accounts/bulk', async (req, res) => {
    try {
        const { accounts } = req.body;
        if (!accounts || !Array.isArray(accounts) || accounts.length === 0) {
            return res.status(400).json({ error: 'Data tidak valid' });
        }

        // Limit bulk size
        if (accounts.length > 100) {
            return res.status(400).json({ error: 'Maksimal 100 akun per request' });
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
        res.status(500).json({ error: 'Gagal menyimpan akun' });
    }
});

// PUT bulk status
app.put('/api/accounts/bulk/status', async (req, res) => {
    try {
        const { ids, status } = req.body;
        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ error: 'ID tidak valid' });
        }

        // Limit bulk size
        if (ids.length > 100) {
            return res.status(400).json({ error: 'Maksimal 100 ID per request' });
        }

        if (!['available', 'sold', 'personal', 'available_3d'].includes(status)) {
            return res.status(400).json({ error: 'Status tidak valid' });
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
        console.error('❌ Error updating bulk status:', error);
        res.status(500).json({ error: 'Gagal update status' });
    }
});

// PUT update account
app.put('/api/accounts/:id', [
    body('email').optional().isEmail().normalizeEmail(),
    body('username').optional().trim().isLength({ min: 1, max: 100 }),
    body('password').optional().trim().isLength({ min: 1, max: 100 }),
    body('totp').optional().trim().isLength({ max: 50 })
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ error: 'Data tidak valid' });
        }

        const { email, username, password, totp } = req.body;
        const updateData = {};
        if (email !== undefined) updateData.email = email.trim();
        if (username !== undefined) updateData.username = username.trim();
        if (password !== undefined) updateData.password = password.trim();
        if (totp !== undefined) updateData.totp = totp.trim();

        const account = await Account.findByIdAndUpdate(
            req.params.id,
            updateData,
            { new: true, runValidators: true }
        );
        if (!account) return res.status(404).json({ error: 'Akun tidak ditemukan' });
        res.json(account);
    } catch (error) {
        console.error('Error updating account:', error);
        res.status(500).json({ error: 'Gagal update akun' });
    }
});

// DELETE account
app.delete('/api/accounts/:id', async (req, res) => {
    try {
        const account = await Account.findByIdAndDelete(req.params.id);
        if (!account) return res.status(404).json({ error: 'Akun tidak ditemukan' });
        res.json({ message: 'Akun berhasil dihapus' });
    } catch (error) {
        console.error('Error deleting account:', error);
        res.status(500).json({ error: 'Gagal hapus akun' });
    }
});

// ============ KONEKSI MONGODB ============
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

        // Generate password hash jika belum ada
        if (!process.env.ADMIN_PASSWORD_HASH) {
            console.log('\n⚠️  PASSWORD HASH BELUM DISET!');
            console.log('Generate dengan: node -e "console.log(require(\'bcryptjs\').hashSync(\'rahasia123\', 10))"');
            console.log('Lalu tambahkan ke .env: ADMIN_PASSWORD_HASH=hasil_hash\n');
        }

        app.listen(PORT, '0.0.0.0', () => {
            console.log(`🚀 Server running on http://localhost:${PORT}`);
            console.log(`🔐 Login: ${process.env.ADMIN_USERNAME || 'admin'} / password dari .env`);
            console.log(`🛡️  Security: Helmet, Rate Limit, Session, CSRF Protection`);
        });
    })
    .catch(err => {
        console.error('❌ MongoDB connection error:', err);
        app.listen(PORT, '0.0.0.0', () => {
            console.log(`🚀 Server running (without DB) on http://localhost:${PORT}`);
        });
    });

process.on('unhandledRejection', (err) => {
    console.error('Unhandled Rejection:', err);
});
