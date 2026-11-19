import { resolve } from 'node:path';
import { DatabaseManager } from './database.js';

let defaultDb: DatabaseManager | null = null;

export function initDatabase(dbPath?: string): DatabaseManager {
  if (defaultDb) return defaultDb;

  const targetPath =
    dbPath ||
    process.env.DATABASE_PATH ||
    resolve(process.cwd(), 'data', 'folk_tag.db');

  defaultDb = new DatabaseManager(targetPath);
  console.log(`[Database] SQLite initialized at: ${targetPath}`);
  return defaultDb;
}

export function getDatabase(): DatabaseManager {
  if (!defaultDb) {
    return initDatabase();
  }
  return defaultDb;
}

export * from './database.js';
export * from './schema.js';
