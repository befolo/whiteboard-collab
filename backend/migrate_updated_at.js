const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'database.db');
console.log('Opening database:', dbPath);

const db = new Database(dbPath);

// Check current schema
const cols = db.prepare('PRAGMA table_info(boards)').all();
console.log('Current columns:', cols.map(c => c.name).join(', '));

// Add updated_at if missing
if (!cols.find(c => c.name === 'updated_at')) {
    console.log('Adding updated_at column...');
    db.exec('ALTER TABLE boards ADD COLUMN updated_at INTEGER');
    console.log('SUCCESS: updated_at column added!');
} else {
    console.log('updated_at column already exists');
}

db.close();
console.log('Migration complete!');
