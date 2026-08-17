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

if (artistColumns.some((column) => column.name === 'sns_account')) {
  database.exec('ALTER TABLE artists DROP COLUMN sns_account');
}

database.exec(`
  CREATE TABLE IF NOT EXISTS artist_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    artist_id INTEGER NOT NULL,
    platform TEXT NOT NULL,
    url TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    UNIQUE (artist_id, platform, url),
    FOREIGN KEY (artist_id) REFERENCES artists (id) ON UPDATE CASCADE ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_artist_links_artist ON artist_links (artist_id);
`);

const assignmentColumns = database.prepare('PRAGMA table_info(assignments)').all();
if (!assignmentColumns.some((column) => column.name === 'target_scope')) {
  database.exec("ALTER TABLE assignments ADD COLUMN target_scope TEXT NOT NULL DEFAULT 'ALL'");
}

const hadLegacyWeekColumn = migrateAssignmentRound(assignmentColumns);
if (hadLegacyWeekColumn) renumberLegacyAssignments();
database.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_assignments_round_no ON assignments (round_no)');

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
// 모든 기존 미션도 현재 정책에 맞춰 활동중인 전체 작가의 공통 미션으로 전환합니다.
database.exec("UPDATE assignments SET target_scope = 'ALL'");
database.exec('DELETE FROM assignment_artists');
console.log(`SQLite schema is ready: ${config.db.file}`);
database.close();

function migrateAssignmentRound(columns) {
  const hasRoundNo = columns.some((column) => column.name === 'round_no');
  const hasWeek = columns.some((column) => column.name === 'week');
  if (hasRoundNo || !hasWeek) return false;

  database.exec('ALTER TABLE assignments RENAME COLUMN week TO round_no');
  return true;
}

function renumberLegacyAssignments() {
  const assignments = database.prepare(
    'SELECT id FROM assignments ORDER BY round_no ASC, start_at ASC, id ASC'
  ).all();

  database.exec('BEGIN');
  try {
    const update = database.prepare('UPDATE assignments SET round_no = ? WHERE id = ?');
    // 기존 고유 제약을 유지한 채 순서를 바꾸면 중간 값이 충돌할 수 있어 임시 번호를 먼저 부여합니다.
    assignments.forEach((assignment, index) => update.run(assignments.length + index + 1, assignment.id));
    assignments.forEach((assignment, index) => update.run(index + 1, assignment.id));
    database.exec('COMMIT');
  } catch (error) {
    try {
      database.exec('ROLLBACK');
    } catch {
      // Keep the original migration error.
    }
    throw error;
  }
}
