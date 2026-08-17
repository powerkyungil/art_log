import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { config } from '../config.js';

fs.mkdirSync(path.dirname(config.db.file), { recursive: true });

export const database = new DatabaseSync(config.db.file);
database.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');

const readQuery = /^\s*(SELECT|WITH|PRAGMA|EXPLAIN)\b/i;

export const pool = {
  execute(sql, params = []) {
    const statement = database.prepare(sql);
    if (readQuery.test(sql)) {
      return [statement.all(...params), []];
    }
    const result = statement.run(...params);
    return [{
      affectedRows: Number(result.changes || 0),
      insertId: Number(result.lastInsertRowid || 0)
    }, []];
  },

  end() {
    database.close();
  }
};

export async function withTransaction(callback) {
  try {
    database.exec('BEGIN');
    const result = await callback(pool);
    database.exec('COMMIT');
    return result;
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
}
