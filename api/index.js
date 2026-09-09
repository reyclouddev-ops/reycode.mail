const express = require('express');
const mongoose = require('mongoose');
const path = require('path');

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

const MONGO_URI = process.env.MONGO_URI || '';
let isConnected = false;

async function connectDB() {
  if (isConnected) return;
  try {
    await mongoose.connect(MONGO_URI);
    isConnected = true;
    console.log('MongoDB Connected Successfully');
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

// 1. Endpoint Webhook untuk Cloudflare Worker
app.post('/api/webhook', async (req, res) => {
  await connectDB();
  try {
    const { secret, to, from, subject, text, html } = req.body;
    
    const validSecret = process.env.WEBHOOK_SECRET || 'reycode123';
    if (secret !== validSecret) {
      return res.status(403).json({ error: 'Unauthorized: Invalid secret token' });
    }

    if (!to) {
      return res.status(400).json({ error: 'Recipient (to) is required' });
    }

    const cleanTo = String(to).trim().toLowerCase();
    const cleanFrom = String(from || 'No Sender').trim();
    const cleanSubject = String(subject || 'No Subject').trim();
    const cleanText = String(text || '[Tidak ada teks]').trim();
    const cleanHtml = String(html || cleanText).trim();

    await EmailMessage.create({
      to: cleanTo,
      from: cleanFrom,
      subject: cleanSubject,
      text: cleanText,
      html: cleanHtml
    });
    
    return res.status(200).json({ success: true, message: 'Email saved successfully!' });
  } catch (err) {
    console.error('Webhook Error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// 2. Endpoint Login Akun Privat / Bot
app.post('/api/auth/login', async (req, res) => {
  await connectDB();
  try {
    let { email, password } = req.body;
    if (!email || typeof email !== 'string' || email.trim() === '') {
      return res.status(400).json({ error: 'Email wajib diisi!' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanPassword = password ? password.trim() : '';

    let account = await Account.findOne({ email: cleanEmail });
    
    if (!account) {
      if (cleanEmail.endsWith('@reycode.my.id') || cleanEmail.endsWith('@legionteknologi.my.id')) {
        account = await Account.create({ 
          email: cleanEmail, 
          password: cleanPassword || 'reycode123' 
        });
      } else {
        return res.status(400).json({ error: 'Email tidak terdaftar di sistem domain kami!' });
      }
    } else {
      if (account.password && cleanPassword && account.password !== cleanPassword) {
        return res.status(400).json({ error: 'Password salah!' });
      }
    }

    return res.status(200).json({ success: true, email: account.email });
  } catch (err) {
    console.error('Login Error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// 3. Endpoint Ambil Pesan Inbox Berdasarkan Email
app.get('/api/messages/:email', async (req, res) => {
  await connectDB();
  try {
    const email = req.params.email.toLowerCase();
    const messages = await EmailMessage.find({ to: email }).sort({ createdAt: -1 });
    return res.status(200).json({ success: true, messages });
  } catch (err) {
    console.error('Fetch Messages Error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// 4. Endpoint Dokumentasi API
app.get('/api/docs', (req, res) => {
  res.json({
    project: "ReyCode Temp Mail & Custom Domain API",
    version: "2.3.0",
    domains: ["reycode.my.id", "legionteknologi.my.id"],
    endpoints: {
      checkInbox: "GET /api/messages/:email",
      loginAccount: "POST /api/auth/login",
      webhookReceiver: "POST /api/webhook"
    }
  });
});

// Routing Halaman HTML Statis untuk Vercel Serverless
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, '../login.html'));
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../index.html'));
});

// Fallback static files
app.use(express.static(path.join(__dirname, '../')));

const PORT = process.env.PORT || 3000;
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}

module.exports = app;
