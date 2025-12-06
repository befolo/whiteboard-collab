const Database = require('better-sqlite3');
const path = require('path');

const dbPath = process.env.DB_PATH ? path.resolve(process.env.DB_PATH) : path.join(__dirname, '..', 'database.db');
const db = new Database(dbPath);

// Enable foreign keys
db.pragma('foreign_keys = ON');

function migrate() {
  const schema = `
    CREATE TABLE IF NOT EXISTS boards (
      id TEXT PRIMARY KEY,
      created_at INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS strokes (
      id TEXT PRIMARY KEY,
      board_id TEXT NOT NULL,
      points TEXT NOT NULL, -- JSON
      color TEXT NOT NULL,
      width REAL NOT NULL,
      tool TEXT NOT NULL,
      created_at INTEGER DEFAULT (unixepoch()),
      FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS objects (
      id TEXT PRIMARY KEY,
      board_id TEXT NOT NULL,
      type TEXT NOT NULL,
      props TEXT NOT NULL, -- JSON
      z_index INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER DEFAULT (unixepoch()),
      FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      display_name TEXT,
      created_at INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token TEXT UNIQUE NOT NULL,
      expires_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS board_members (
      board_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('editor', 'viewer')),
      PRIMARY KEY (board_id, user_id),
      FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `;

  db.exec(schema);

  try {
    db.exec('ALTER TABLE boards ADD COLUMN owner_id TEXT REFERENCES users(id)');
  } catch (e) {
    // Column likely already exists
  }

  try {
    db.exec('ALTER TABLE boards ADD COLUMN name TEXT DEFAULT "Untitled"');
  } catch (e) {
    // Column likely already exists
  }

  try {
    db.exec("ALTER TABLE boards ADD COLUMN updated_at INTEGER DEFAULT (strftime('%s', 'now'))");
    console.log('Added updated_at column to boards table');
  } catch (e) {
    if (!e.message.includes('duplicate column name')) {
      console.error('Migration error (updated_at):', e.message);
    }
  }

  try {
    db.exec('ALTER TABLE board_members ADD COLUMN invite_token TEXT');
  } catch (e) {
    // Column likely already exists
  }

  console.log('Migrations applied successfully.');
}

module.exports = { db, migrate };
