// setup-admins.js
require('dotenv').config();
const bcrypt = require('bcryptjs');

// ✅ FIXED PATH
const { getDb } = require('./database');

// ============================================================
//  EDIT THESE BEFORE RUNNING
// ============================================================
const ADMINS = [
  { userId: 'admin_anurag',   password: 'ChangeMe@2025!', name: 'Anurag Singh' },
  { userId: 'admin_karan',    password: 'ChangeMe@2025!', name: 'Karan Mandal' },
  { userId: 'admin_anik',     password: 'ChangeMe@2025!', name: 'Anik Chakraborty' },
  { userId: 'admin_anubhav',  password: 'ChangeMe@2025!', name: 'Anubhav Kumar Gupta' },
  { userId: 'admin_sakshi',   password: 'ChangeMe@2025!', name: 'Sakshi Singh' },
];
// ============================================================

async function seed() {
  const db = getDb();
  const insert = db.prepare(
    'INSERT OR REPLACE INTO admins (user_id, password_hash, name) VALUES (?, ?, ?)'
  );

  console.log('Seeding admins...\n');
  for (const admin of ADMINS) {
    const hash = await bcrypt.hash(admin.password, 12);
    insert.run(admin.userId, hash, admin.name);
    console.log(`  ✓ ${admin.name} (${admin.userId})`);
  }
  console.log('\nDone! Admins are ready.');
  process.exit(0);
}

seed().catch(err => {
  console.error(err);
  process.exit(1);
});