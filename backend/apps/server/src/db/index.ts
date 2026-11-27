import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseManager } from './database.js';

let defaultDb: DatabaseManager | null = null;

export function initDatabase(dbPath?: string): DatabaseManager {
  if (defaultDb) return defaultDb;

  const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
  const isTest = process.env.NODE_ENV === 'test';
  const targetPath =
    dbPath ||
    process.env.DATABASE_PATH ||
    (isTest ? ':memory:' : resolve(packageRoot, 'data', 'folk_tag.db'));

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
