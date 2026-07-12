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

// Serve static files dari folder 'public'
app.use(express.static(path.join(__dirname, 'public')));

// Route utama (fallback)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// MongoDB Schema (sama seperti sebelumnya)
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
accountSchema.virtual('days').get(function() {
    const now = new Date();
    const diff = now - this.created_at;
    return Math.floor(diff / (1000 * 60 * 60 * 24));
});
accountSchema.set('toJSON', { virtuals: true });
accountSchema.set('toObject', { virtuals: true });
const Account = mongoose.model('Account', accountSchema);

// ============ ROUTES API (sama seperti sebelumnya) ============
// ... (semua route GET/POST/PUT/DELETE dari kode sebelumnya) ...

// Koneksi ke MongoDB Atlas
mongoose.connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
.then(() => {
    console.log('✅ Connected to MongoDB Atlas');
    app.listen(PORT, () => {
        console.log(`🚀 Server running on http://localhost:${PORT}`);
    });
})
.catch(err => {
    console.error('❌ MongoDB connection error:', err);
    process.exit(1);
});
