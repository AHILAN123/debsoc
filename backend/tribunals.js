const express = require('express');
const path = require('path');
const fs = require('fs');

// ✅ FIXED PATHS
const { getDb } = require('./database');
const { requireAuth } = require('./middleware/auth');
const { tribunalUpload } = require('./upload');

const router = express.Router();

// ─── PUBLIC ──────────────────────────────────────────────

// GET /api/tribunals
router.get('/', (req, res) => {
  const db = getDb();
  const tribunals = db.prepare(
    'SELECT id, title, cover_image, pdf_filename, published_date, part, created_at FROM tribunals ORDER BY created_at DESC'
  ).all();

  const items = tribunals.map(t => ({
    ...t,
    coverUrl: t.cover_image ? `/uploads/tribunals/${t.cover_image}` : null,
    pdfUrl: `/uploads/tribunals/${t.pdf_filename}`
  }));

  res.json({ items });
});

// GET /api/tribunals/:id
router.get('/:id', (req, res) => {
  const db = getDb();
  const t = db.prepare('SELECT * FROM tribunals WHERE id = ?').get(req.params.id);
  if (!t) return res.status(404).json({ error: 'Not found' });

  res.json({
    ...t,
    coverUrl: t.cover_image ? `/uploads/tribunals/${t.cover_image}` : null,
    pdfUrl: `/uploads/tribunals/${t.pdf_filename}`
  });
});

// ─── ADMIN ───────────────────────────────────────────────

// POST /api/tribunals
router.post('/',
  requireAuth,
  tribunalUpload.fields([
    { name: 'pdf', maxCount: 1 },
    { name: 'cover', maxCount: 1 }
  ]),
  (req, res) => {
    const { title, published_date, part } = req.body;

    if (!title || !published_date || !part) {
      return res.status(400).json({ error: 'title, published_date, and part are required' });
    }
    if (!req.files?.pdf) {
      return res.status(400).json({ error: 'PDF file is required' });
    }

    const db = getDb();

    const pdfFilename = req.files.pdf[0].filename;
    const coverFilename = req.files?.cover?.[0]?.filename || null;

    const result = db.prepare(
      'INSERT INTO tribunals (title, cover_image, pdf_filename, published_date, part, created_by) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(title, coverFilename, pdfFilename, published_date, part, req.admin.userId);

    res.status(201).json({
      id: result.lastInsertRowid,
      title,
      pdfUrl: `/uploads/tribunals/${pdfFilename}`,
      coverUrl: coverFilename ? `/uploads/tribunals/${coverFilename}` : null
    });
  }
);

// PUT /api/tribunals/:id
router.put('/:id', requireAuth, (req, res) => {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM tribunals WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });

  const { title, published_date, part } = req.body;

  db.prepare(
    'UPDATE tribunals SET title = ?, published_date = ?, part = ? WHERE id = ?'
  ).run(
    title || existing.title,
    published_date || existing.published_date,
    part || existing.part,
    req.params.id
  );

  res.json({ success: true });
});

// DELETE
router.delete('/:id', requireAuth, (req, res) => {
  const db = getDb();
  const row = db.prepare('SELECT * FROM tribunals WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });

  // ✅ FIXED PATH
  const base = path.join(__dirname, 'uploads', 'tribunals');

  [row.pdf_filename, row.cover_image].forEach(f => {
    if (f) {
      const fp = path.join(base, f);
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
    }
  });

  db.prepare('DELETE FROM tribunals WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;