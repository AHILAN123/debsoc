const express = require('express');
const path = require('path');
const fs = require('fs');

// ✅ FIXED PATHS
const { getDb } = require('./database');
const { requireAuth } = require('./middleware/auth');
const { galleryUpload } = require('./upload');

const router = express.Router();

// ─── PUBLIC ──────────────────────────────────────────────

// GET /api/gallery?page=1
router.get('/', (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const PAGE_SIZE = 9;
  const offset = (page - 1) * PAGE_SIZE;
  const db = getDb();

  const total = db.prepare('SELECT COUNT(*) as count FROM gallery').get().count;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  const images = db.prepare(
    'SELECT id, filename, caption, page_number, sort_order, uploaded_at FROM gallery ORDER BY page_number ASC, sort_order ASC, uploaded_at DESC LIMIT ? OFFSET ?'
  ).all(PAGE_SIZE, offset);

  const items = images.map(img => ({
    ...img,
    url: `/uploads/gallery/${img.filename}`
  }));

  res.json({ page, totalPages, total, items });
});

// GET /api/gallery/all-pages
router.get('/all-pages', (req, res) => {
  const db = getDb();
  const total = db.prepare('SELECT COUNT(*) as count FROM gallery').get().count;
  const totalPages = Math.ceil(total / 9) || 1;
  res.json({ totalPages, total });
});

// ─── ADMIN ───────────────────────────────────────────────

// POST /api/gallery
router.post('/', requireAuth, galleryUpload.array('photos', 20), (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'No files uploaded' });
  }

  const db = getDb();
  const caption = req.body.caption || '';

  const total = db.prepare('SELECT COUNT(*) as count FROM gallery').get().count;
  const PAGE_SIZE = 9;

  const insert = db.prepare(
    'INSERT INTO gallery (filename, caption, page_number, sort_order, uploaded_by) VALUES (?, ?, ?, ?, ?)'
  );

  const insertMany = db.transaction((files) => {
    let currentTotal = total;
    const inserted = [];
    for (const file of files) {
      const pageNum = Math.floor(currentTotal / PAGE_SIZE) + 1;
      const sortOrder = currentTotal % PAGE_SIZE;
      const result = insert.run(file.filename, caption, pageNum, sortOrder, req.admin.userId);
      inserted.push({
        id: result.lastInsertRowid,
        filename: file.filename,
        url: `/uploads/gallery/${file.filename}`,
        page_number: pageNum
      });
      currentTotal++;
    }
    return inserted;
  });

  const inserted = insertMany(req.files);
  res.status(201).json({ uploaded: inserted.length, items: inserted });
});

// DELETE
router.delete('/:id', requireAuth, (req, res) => {
  const db = getDb();
  const row = db.prepare('SELECT * FROM gallery WHERE id = ?').get(req.params.id);

  if (!row) return res.status(404).json({ error: 'Image not found' });

  // ✅ FIXED PATH
  const filePath = path.join(__dirname, 'uploads', 'gallery', row.filename);

  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

  db.prepare('DELETE FROM gallery WHERE id = ?').run(req.params.id);

  reorderGallery(db);

  res.json({ success: true });
});

// REORDER
router.put('/reorder', requireAuth, (req, res) => {
  const { order } = req.body;
  if (!Array.isArray(order)) return res.status(400).json({ error: 'order must be an array' });

  const db = getDb();
  const update = db.prepare('UPDATE gallery SET sort_order = ? WHERE id = ?');

  const updateMany = db.transaction((items) => {
    for (const item of items) {
      update.run(item.sort_order, item.id);
    }
  });

  updateMany(order);
  reorderGallery(db);

  res.json({ success: true });
});

function reorderGallery(db) {
  const all = db.prepare('SELECT id FROM gallery ORDER BY page_number ASC, sort_order ASC, uploaded_at DESC').all();
  const PAGE_SIZE = 9;

  const updatePage = db.prepare('UPDATE gallery SET page_number = ?, sort_order = ? WHERE id = ?');

  const reorder = db.transaction((rows) => {
    rows.forEach((row, idx) => {
      updatePage.run(Math.floor(idx / PAGE_SIZE) + 1, idx % PAGE_SIZE, row.id);
    });
  });

  reorder(all);
}

module.exports = router;