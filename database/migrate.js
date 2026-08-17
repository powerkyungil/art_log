import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import '../src/config.js';
import { config } from '../src/config.js';
import { database } from '../src/db/pool.js';
import { DEFAULT_ARTIST_PASSWORD, hashArtistPassword } from '../src/utils/artistAuth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.join(__dirname, 'schema.sql');
const schema = await fs.readFile(schemaPath, 'utf8');
database.exec(schema);

const artistColumns = database.prepare('PRAGMA table_info(artists)').all();
if (!artistColumns.some((column) => column.name === 'password_hash')) {
  database.exec("ALTER TABLE artists ADD COLUMN password_hash TEXT NOT NULL DEFAULT ''");
}

const uninitializedArtists = database.prepare(
  "SELECT id FROM artists WHERE password_hash IS NULL OR password_hash = ''"
).all();
if (uninitializedArtists.length) {
  const initialPasswordHash = await hashArtistPassword(DEFAULT_ARTIST_PASSWORD);
  database.prepare(
    "UPDATE artists SET password_hash = ?, updated_at = datetime('now', 'localtime') WHERE password_hash IS NULL OR password_hash = ''"
  ).run(initialPasswordHash);
}

const assignmentColumns = database.prepare('PRAGMA table_info(assignments)').all();
if (!assignmentColumns.some((column) => column.name === 'target_scope')) {
  database.exec("ALTER TABLE assignments ADD COLUMN target_scope TEXT NOT NULL DEFAULT 'ALL'");
}

removeUniqueWeekConstraint();

database.exec(`
  CREATE TABLE IF NOT EXISTS assignment_artists (
    assignment_id INTEGER NOT NULL,
    artist_id INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    PRIMARY KEY (assignment_id, artist_id),
    FOREIGN KEY (assignment_id) REFERENCES assignments (id) ON UPDATE CASCADE ON DELETE CASCADE,
    FOREIGN KEY (artist_id) REFERENCES artists (id) ON UPDATE CASCADE ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_assignment_artists_artist ON assignment_artists (artist_id);
`);
console.log(`SQLite schema is ready: ${config.db.file}`);
database.close();

function removeUniqueWeekConstraint() {
  const indexes = database.prepare('PRAGMA index_list(assignments)').all();
  const hasUniqueWeek = indexes.some((index) => {
    if (Number(index.unique) !== 1) return false;
    const indexName = String(index.name).replaceAll('"', '""');
    const columns = database.prepare(`PRAGMA index_info("${indexName}")`).all();
    return columns.length === 1 && columns[0].name === 'week';
  });

  if (!hasUniqueWeek) return;

  database.exec('PRAGMA foreign_keys = OFF');
  try {
    database.exec('BEGIN');
    database.exec(`
      CREATE TABLE assignments_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        week INTEGER NOT NULL CHECK (week > 0),
        title TEXT NOT NULL,
        topic TEXT NOT NULL,
        description TEXT,
        recommended_channel TEXT,
        start_at TEXT NOT NULL,
        due_at TEXT NOT NULL,
        is_visible INTEGER NOT NULL DEFAULT 0 CHECK (is_visible IN (0, 1)),
        target_scope TEXT NOT NULL DEFAULT 'ALL' CHECK (target_scope IN ('ALL', 'SELECTED')),
        created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
      )
    `);
    database.exec(`
      INSERT INTO assignments_new
        (id, week, title, topic, description, recommended_channel, start_at, due_at,
         is_visible, target_scope, created_at, updated_at)
      SELECT id, week, title, topic, description, recommended_channel, start_at, due_at,
             is_visible, target_scope, created_at, updated_at
      FROM assignments
    `);
    database.exec('DROP TABLE assignments');
    database.exec('ALTER TABLE assignments_new RENAME TO assignments');
    database.exec('COMMIT');
  } catch (error) {
    try {
      database.exec('ROLLBACK');
    } catch {
      // Keep the original migration error.
    }
    throw error;
  } finally {
    database.exec('PRAGMA foreign_keys = ON');
  }

  database.exec('CREATE INDEX IF NOT EXISTS idx_assignments_visibility_dates ON assignments (is_visible, start_at, due_at)');
}
