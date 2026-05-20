const express = require('express');
const path = require('path');
const fs = require('fs');


const { getDb } = require('./database');
const { requireAuth } = require('./middleware/auth');
const { eventUpload } = require('./upload');

const router = express.Router();

router.get('/', (req, res) => {
  const db = getDb();
  const events = db.prepare(
    'SELECT * FROM events ORDER BY sort_order ASC, created_at DESC'
  ).all();

  const items = events.map(e => ({
    ...e,
    photoUrl: e.photo_filename ? `/uploads/events/${e.photo_filename}` : null,
    pdfUrl: e.pdf_filename ? `/uploads/events/${e.pdf_filename}` : null
  }));

  res.json({ items });
});


router.get('/:id', (req, res) => {
  const db = getDb();
  const e = db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id);
  if (!e) return res.status(404).json({ error: 'Not found' });

  res.json({
    ...e,
    photoUrl: e.photo_filename ? `/uploads/events/${e.photo_filename}` : null,
    pdfUrl: e.pdf_filename ? `/uploads/events/${e.pdf_filename}` : null
  });
});
router.post('/',
  requireAuth,
  eventUpload.fields([
    { name: 'photo', maxCount: 1 },
    { name: 'pdf', maxCount: 1 }
  ]),
  (req, res) => {
    const { name, event_date, event_time, venue, description } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Event name is required' });
    }

    const db = getDb();
    const maxOrder = db.prepare('SELECT MAX(sort_order) as mo FROM events').get().mo || 0;

    const photoFilename = req.files?.photo?.[0]?.filename || null;
    const pdfFilename = req.files?.pdf?.[0]?.filename || null;

    const result = db.prepare(`
      INSERT INTO events (name, event_date, event_time, venue, description, photo_filename, pdf_filename, sort_order, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(name, event_date || null, event_time || null, venue || null, description || null, photoFilename, pdfFilename, maxOrder + 1, req.admin.userId);

    res.status(201).json({
      id: result.lastInsertRowid,
      name,
      photoUrl: photoFilename ? `/uploads/events/${photoFilename}` : null,
      pdfUrl: pdfFilename ? `/uploads/events/${pdfFilename}` : null
    });
  }
);

// PUT /api/events/:id
router.put('/:id',
  requireAuth,
  eventUpload.fields([
    { name: 'photo', maxCount: 1 },
    { name: 'pdf', maxCount: 1 }
  ]),
  (req, res) => {
    const db = getDb();
    const existing = db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Not found' });

    const { name, event_date, event_time, venue, description } = req.body;

    // ✅ FIXED path
    const base = path.join(__dirname, 'uploads', 'events');

    let photoFilename = existing.photo_filename;
    let pdfFilename = existing.pdf_filename;

    if (req.files?.photo) {
      if (existing.photo_filename) {
        const old = path.join(base, existing.photo_filename);
        if (fs.existsSync(old)) fs.unlinkSync(old);
      }
      photoFilename = req.files.photo[0].filename;
    }

    if (req.files?.pdf) {
      if (existing.pdf_filename) {
        const old = path.join(base, existing.pdf_filename);
        if (fs.existsSync(old)) fs.unlinkSync(old);
      }
      pdfFilename = req.files.pdf[0].filename;
    }

    db.prepare(`
      UPDATE events SET name=?, event_date=?, event_time=?, venue=?, description=?, photo_filename=?, pdf_filename=? WHERE id=?
    `).run(
      name || existing.name,
      event_date !== undefined ? event_date : existing.event_date,
      event_time !== undefined ? event_time : existing.event_time,
      venue !== undefined ? venue : existing.venue,
      description !== undefined ? description : existing.description,
      photoFilename,
      pdfFilename,
      req.params.id
    );

    res.json({ success: true });
  }
);

// DELETE
router.delete('/:id', requireAuth, (req, res) => {
  const db = getDb();
  const row = db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });

  const base = path.join(__dirname, 'uploads', 'events');

  [row.photo_filename, row.pdf_filename].forEach(f => {
    if (f) {
      const fp = path.join(base, f);
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
    }
  });

  db.prepare('DELETE FROM events WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// REORDER
router.put('/reorder', requireAuth, (req, res) => {
  const { order } = req.body;
  if (!Array.isArray(order)) return res.status(400).json({ error: 'order must be array' });

  const db = getDb();
  const update = db.prepare('UPDATE events SET sort_order = ? WHERE id = ?');
  const reorder = db.transaction((items) => {
    for (const item of items) update.run(item.sort_order, item.id);
  });

  reorder(order);
  res.json({ success: true });
});

module.exports = router;