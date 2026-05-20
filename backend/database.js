const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_DIR = path.join(__dirname, 'data');

fs.mkdirSync(DB_DIR, { recursive: true });
const DB_PATH = path.join(DB_DIR, 'debsoc.db');

let db;

function getDb(){
  if (!db){
    try{
      db = new Database(DB_PATH);

      console.log('✅ Database connected at:', DB_PATH);

      db.pragma('journal_mode = WAL');
      db.pragma('foreign_keys = ON');

      initSchema();
    } catch (err) {
      console.error(' Database initialization failed:', err.message);
      process.exit(1);
    }
  }
  return db;
}
function initSchema(){
  db.exec(`
    CREATE TABLE IF NOT EXISTS admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS tribunals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      cover_image TEXT,
      pdf_filename TEXT NOT NULL,
      published_date TEXT NOT NULL,
      part TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      created_by TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS gallery (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL,
      caption TEXT,
      page_number INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      uploaded_at TEXT DEFAULT (datetime('now')),
      uploaded_by TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      event_date TEXT,
      event_time TEXT,
      venue TEXT,
      description TEXT,
      photo_filename TEXT,
      pdf_filename TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      created_by TEXT NOT NULL
    );
  `);

  console.log('✅ Database schema initialized');
}

module.exports = { getDb };