const express = require('express');
const mongoose = require('mongoose');
const path = require('path');

const app = express();
app.use(express.json({ limit: '10mb' })); // Batas payload besar untuk email bergambar/lampiran teks
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

const MONGO_URI = process.env.MONGO_URI || 'ISI_MONGO_URI_KAMU_DISINI';
let isConnected = false;

async function connectDB() {
  if (isConnected) return;
  try {
    await mongoose.connect(MONGO_URI);
    isConnected = true;
    console.log('MongoDB Connected');
  } catch (err) {
    console.error('MongoDB Connection Error:', err);
  }
}

const accountSchema = new mongoose.Schema({
  email: { type: String, unique: true, lowercase: true },
  password: { type: String },
  createdAt: { type: Date, default: Date.now }
});
const Account = mongoose.models.Account || mongoose.model('Account', accountSchema);

const emailSchema = new mongoose.Schema({
  to: String,
  from: String,
  subject: String,
  text: String,
  html: String,
  createdAt: { type: Date, default: Date.now, expires: 86400 } // Auto hapus 24 jam
});
const EmailMessage = mongoose.models.EmailMessage || mongoose.model('EmailMessage', emailSchema);

// ⭐ ENDPOINT WEBHOOK UTAMA (Nangkap data dari Cloudflare Worker dengan aman)
app.post('/api/webhook', async (req, res) => {
  await connectDB();
  try {
    const { secret, to, from, subject, text, html } = req.body;
    
    // Validasi Secret Token
    const validSecret = process.env.WEBHOOK_SECRET || 'reycode123';
    if (secret !== validSecret) {
      return res.status(403).json({ error: 'Unauthorized: Invalid secret token' });
    }

    if (!to) {
      return res.status(400).json({ error: 'Recipient (to) is required' });
    }

    // Bersihkan dan pastikan data tidak ada yang missing
    const cleanTo = String(to).trim().toLowerCase();
    const cleanFrom = String(from || 'No Sender').trim();
    const cleanSubject = String(subject || 'No Subject').trim();
    const cleanText = String(text || '[Tidak ada teks atau format body tidak terbaca]').trim();
    const cleanHtml = String(html || cleanText).trim();

    // Simpan ke MongoDB Atlas
    await EmailMessage.create({
      to: cleanTo,
      from: cleanFrom,
      subject: cleanSubject,
      text: cleanText,
      html: cleanHtml
    });
    
    return res.status(200).json({ success: true, message: 'Email successfully captured and saved!' });
  } catch (err) {
    console.error('Webhook Capture Error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// Endpoint Login Akun Bot
app.post('/api/auth/login', async (req, res) => {
  await connectDB();
  try {
    const { email, password } = req.body;
    if (!email) return res.status(400).json({ error: 'Email wajib diisi!' });

    const cleanEmail = email.toLowerCase();
    const account = await Account.findOne({ email: cleanEmail });
    
    if (!account) {
      if (cleanEmail.endsWith('@reycode.my.id') || cleanEmail.endsWith('@legionteknologi.my.id')) {
        const newAcc = await Account.create({ email: cleanEmail, password: password || 'reycode123' });
        return res.status(200).json({ success: true, email: newAcc.email });
      }
      return res.status(400).json({ error: 'Email tidak ditemukan di sistem!' });
    }

    if (account.password && password && account.password !== password) {
      return res.status(400).json({ error: 'Password salah!' });
    }

    return res.status(200).json({ success: true, email: account.email });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Endpoint Cek Inbox Real-Time
app.get('/api/messages/:email', async (req, res) => {
  await connectDB();
  try {
    const email = req.params.email.toLowerCase();
    const messages = await EmailMessage.find({ to: email }).sort({ createdAt: -1 });
    return res.status(200).json({ success: true, messages });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Endpoint Dokumentasi API
app.get('/api/docs', (req, res) => {
  res.json({
    project: "ReyCode Temp Mail & Custom Domain API",
    version: "2.1.0",
    domains: ["reycode.my.id", "legionteknologi.my.id"],
    endpoints: {
      checkInbox: "GET /api/messages/:email",
      loginAccount: "POST /api/auth/login",
      webhookReceiver: "POST /api/webhook"
    }
  });
});

// Load file HTML dari root folder langsung
app.use(express.static(path.join(__dirname, '../')));

const PORT = process.env.PORT || 3000;
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}

module.exports = app;
