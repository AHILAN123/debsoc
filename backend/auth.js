const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// ✅ FIXED PATHS
const { getDb } = require('./database');
const { requireAuth } = require('./middleware/auth');

const router = express.Router();

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { userId, password } = req.body;

  if (!userId || !password) {
    return res.status(400).json({ error: 'userId and password are required' });
  }

  const db = getDb();
  const admin = db.prepare('SELECT * FROM admins WHERE user_id = ?').get(userId);

  if (!admin) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const valid = await bcrypt.compare(password, admin.password_hash);
  if (!valid) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = jwt.sign(
    { userId: admin.user_id, name: admin.name },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
  );

  res.json({
    token,
    admin: { userId: admin.user_id, name: admin.name }
  });
});

// GET /api/auth/me
router.get('/me', requireAuth, (req, res) => {
  res.json({ userId: req.admin.userId, name: req.admin.name });
});

module.exports = router;