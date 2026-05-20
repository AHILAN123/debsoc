const multer = require('multer');
const path = require('path');
const fs = require('fs');

// ✅ FIXED: stays inside backend/uploads
const UPLOAD_BASE = path.join(__dirname, 'uploads');

function makeStorage(subfolder) {
  const dir = path.join(UPLOAD_BASE, subfolder);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  return multer.diskStorage({
    destination: (req, file, cb) => cb(null, dir),

    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();

      const base = path.basename(file.originalname, ext)
        .replace(/[^a-zA-Z0-9_-]/g, '_')
        .substring(0, 50);

      const unique = `${Date.now()}_${base}${ext}`;

      cb(null, unique);
    }
  });
}

function fileFilter(allowedTypes) {
  return (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();

    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${ext} not allowed`), false);
    }
  };
}

// Gallery
const galleryUpload = multer({
  storage: makeStorage('gallery'),
  fileFilter: fileFilter(['.jpg', '.jpeg', '.png', '.webp']),
  limits: { fileSize: 10 * 1024 * 1024 }
});

// Tribunals
const tribunalUpload = multer({
  storage: makeStorage('tribunals'),
  fileFilter: fileFilter(['.pdf', '.jpg', '.jpeg', '.png', '.webp']),
  limits: { fileSize: 50 * 1024 * 1024 }
});

// Events
const eventUpload = multer({
  storage: makeStorage('events'),
  fileFilter: fileFilter(['.pdf', '.jpg', '.jpeg', '.png', '.webp']),
  limits: { fileSize: 50 * 1024 * 1024 }
});

module.exports = { galleryUpload, tribunalUpload, eventUpload };