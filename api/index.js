const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const DataStore = require('../lib/dataStore');

const app = express();

const SECRET_KEY = process.env.JWT_SECRET || 'cbdc_dev_fallback_secret_key_change_me_in_prod';

// Enable CORS
const allowedOrigins = [
  'https://pali-omega.vercel.app',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5000',
  'http://127.0.0.1:5000',
  'http://localhost:8080',
  'http://127.0.0.1:8080'
];

if (process.env.CORS_ORIGINS) {
  process.env.CORS_ORIGINS.split(',').forEach(o => {
    if (o.trim()) allowedOrigins.push(o.trim());
  });
}

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin) || origin.endsWith('.vercel.app')) {
      callback(null, true);
    } else {
      callback(null, true); // Permissive for APIs while supporting credentials
    }
  },
  credentials: true
}));

app.use(express.json());

// Prevent any caching on API endpoints for real-time multi-device sync
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});

// In-memory rate limiter for login (5 attempts per minute)
const loginAttempts = new Map();

function rateLimitLogin(req, res, next) {
  const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const windowMs = 60 * 1000;

  const attempts = loginAttempts.get(clientIp) || [];
  const recentAttempts = attempts.filter(time => now - time < windowMs);

  if (recentAttempts.length >= 5) {
    return res.status(429).json({
      error: 'Too many login attempts. Please try again in a minute.'
    });
  }

  recentAttempts.push(now);
  loginAttempts.set(clientIp, recentAttempts);
  next();
}

// Authentication Middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const token = authHeader.substring(7);
  try {
    const payload = jwt.verify(token, SECRET_KEY);
    req.user = payload;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Session expired, please login again' });
    }
    return res.status(401).json({ error: 'Invalid session token' });
  }
}

// --- Health / Status ---
app.get(['/api', '/api/health', '/health', '/'], (req, res) => {
  res.json({
    status: 'online',
    message: 'CBDC Ration Portal API is running successfully on Node.js.',
    version: '1.0.0'
  });
});

// --- Auth Routes ---
app.post(['/api/auth/login', '/auth/login'], rateLimitLogin, (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(401).json({ error: 'Incorrect ID or password' });
  }

  const user = DataStore.getUserByUsername(username);
  if (!user || !user.password_hash) {
    return res.status(401).json({ error: 'Incorrect ID or password' });
  }

  const isMatch = bcrypt.compareSync(password, user.password_hash);
  if (!isMatch) {
    return res.status(401).json({ error: 'Incorrect ID or password' });
  }

  // Token expires in 30 minutes
  const token = jwt.sign(
    {
      userId: user.id,
      username: user.username,
      role: user.role
    },
    SECRET_KEY,
    { expiresIn: '30m' }
  );

  res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
      district: user.district,
      taluka: user.taluka
    }
  });
});

app.post(['/api/auth/logout', '/auth/logout'], (req, res) => {
  res.json({ success: true });
});

app.get(['/api/auth/me', '/auth/me'], authenticateToken, (req, res) => {
  const user = DataStore.getUserById(req.user.userId);
  if (!user) {
    return res.status(401).json({ error: 'User not found' });
  }
  res.json({
    id: user.id,
    username: user.username,
    role: user.role,
    district: user.district,
    taluka: user.taluka
  });
});

// --- Beneficiaries Routes ---
app.get(['/api/beneficiaries', '/beneficiaries'], (req, res) => {
  const { status } = req.query;
  const metadata = DataStore.getMetadata();
  const beneficiaries = DataStore.getBeneficiaries(status);
  res.json({
    metadata,
    beneficiaries
  });
});

app.get(['/api/beneficiaries/:srNo', '/beneficiaries/:srNo'], (req, res) => {
  const beneficiary = DataStore.getBeneficiary(req.params.srNo);
  if (!beneficiary) {
    return res.status(404).json({ error: 'Beneficiary not found' });
  }
  res.json(beneficiary);
});

app.patch(['/api/beneficiaries/:srNo/onboarding', '/beneficiaries/:srNo/onboarding'], authenticateToken, (req, res) => {
  const srNo = req.params.srNo;
  const { field, status, version, remarks } = req.body || {};
  const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';

  try {
    const result = DataStore.updateBeneficiaryOnboarding({
      srNo,
      field,
      status,
      version,
      remarks,
      clientIp,
      userId: req.user.userId
    });

    if (result.conflict) {
      return res.status(409).json({
        error: 'Version conflict',
        currentVersion: result.currentVersion,
        yourVersion: version,
        currentData: result.currentData
      });
    }

    res.json(result.data);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
  }
});

// --- Dashboard & Audit ---
app.get(['/api/dashboard', '/dashboard'], authenticateToken, (req, res) => {
  const stats = DataStore.getDashboardStats(req.user.userId);
  res.json(stats);
});

app.get(['/api/audit', '/audit'], authenticateToken, (req, res) => {
  const limit = req.query.limit || 20;
  const auditData = DataStore.getAuditLogs(req.user.userId, limit);
  res.json(auditData);
});

app.get(['/api/sync/latest', '/sync/latest'], authenticateToken, (req, res) => {
  const syncData = DataStore.getSyncLatest();
  res.json(syncData);
});

module.exports = app;
