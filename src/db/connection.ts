import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const dbPath = path.resolve(__dirname, '../../workflow.db');

// Ensure db directory or file can be created
const db = new Database(dbPath);

// Enable foreign keys
db.pragma('foreign_keys = ON');

export default db;
