require('dotenv').config();
require('./setup-admins');

const express = require('express');
const cors = require('cors');
const path = require('path'); // ✅ ADDED

const authRoutes      = require('./auth');
const galleryRoutes   = require('./gallery');
const tribunalRoutes  = require('./tribunals');
const eventRoutes     = require('./events');

const app = express();
const PORT = process.env.PORT || 3001;

console.log("🚀 Starting DebSoc Backend...");

// ─── CORS ───────────────────────────────────────────────
app.use(cors({
  origin: [
    "https://debsociiests.in",
    "https://www.debsociiests.in"
  ],
  methods: ["GET", "POST", "PUT", "DELETE"],
  credentials: true
}));



// ─── BODY PARSING ───────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));




// ─── SERVE UPLOADED FILES ─────────────
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));



// ─── ROOT ───────────────────────────────────────────────
app.get('/', (req, res) => {
  res.send('DebSoc Backend is running 🚀');
});



// ─── API ROUTES ─────────────────────────────────────────
app.use('/api/auth',      authRoutes);
app.use('/api/gallery',   galleryRoutes);
app.use('/api/tribunals', tribunalRoutes);
app.use('/api/events',    eventRoutes);



// ─── HEALTH CHECK ───────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});



// ─── 404 ────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});



// ─── ERROR HANDLER ──────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('[Error]', err.message);
  res.status(500).json({ error: err.message || 'Internal server error' });
});



// ─── START ──────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => { // ✅ small Render fix
  console.log(`DebSoc Backend running on port ${PORT}`);
});