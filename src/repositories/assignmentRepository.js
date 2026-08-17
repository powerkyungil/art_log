import { pool, withTransaction } from '../db/pool.js';

export const assignmentRepository = {
  async list({ includeHidden = true, month = '' } = {}) {
    const conditions = [];
    const params = [];
    if (!includeHidden) conditions.push('ass.is_visible = 1');
    if (month) {
      conditions.push('substr(ass.start_at, 1, 7) = ?');
      params.push(month);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const [rows] = await pool.execute(
      `SELECT ass.*, COUNT(aa.artist_id) AS target_count
       FROM assignments ass
       LEFT JOIN assignment_artists aa ON aa.assignment_id = ass.id
       ${where}
       GROUP BY ass.id
       ORDER BY ass.week ASC, ass.start_at ASC, ass.id ASC`,
      params
    );
    return rows;
  },

  async findById(id) {
    const [rows] = await pool.execute('SELECT * FROM assignments WHERE id = ? LIMIT 1', [id]);
    return rows[0] || null;
  },

  async findTargetArtistIds(assignmentId) {
    const [rows] = await pool.execute(
      'SELECT artist_id FROM assignment_artists WHERE assignment_id = ? ORDER BY artist_id ASC',
      [assignmentId]
    );
    return rows.map((row) => Number(row.artist_id));
  },

  async findByIdForArtist(assignmentId, artistId) {
    const [rows] = await pool.execute(
      `SELECT ass.* FROM assignments ass
       WHERE ass.id = ? AND ass.is_visible = 1
         AND (ass.target_scope = 'ALL' OR EXISTS (
           SELECT 1 FROM assignment_artists aa
           WHERE aa.assignment_id = ass.id AND aa.artist_id = ?
         ))
       LIMIT 1`,
      [assignmentId, artistId]
    );
    return rows[0] || null;
  },

  async findCurrent() {
    const [rows] = await pool.execute(
      `SELECT * FROM assignments
       WHERE is_visible = 1 AND start_at <= datetime('now', 'localtime') AND due_at >= datetime('now', 'localtime')
       ORDER BY week ASC, start_at ASC, id ASC LIMIT 1`
    );
    if (rows[0]) return rows[0];
    const [fallback] = await pool.execute(
      `SELECT * FROM assignments
       WHERE is_visible = 1 AND start_at <= datetime('now', 'localtime')
       ORDER BY start_at DESC, week DESC, id DESC LIMIT 1`
    );
    return fallback[0] || null;
  },

  async findCurrentForArtist(artistId) {
    const [rows] = await pool.execute(
      `SELECT ass.* FROM assignments ass
       WHERE ass.is_visible = 1
         AND ass.start_at <= datetime('now', 'localtime')
         AND ass.due_at >= datetime('now', 'localtime')
         AND (ass.target_scope = 'ALL' OR EXISTS (
           SELECT 1 FROM assignment_artists aa
           WHERE aa.assignment_id = ass.id AND aa.artist_id = ?
         ))
       ORDER BY ass.week ASC, ass.start_at ASC, ass.id ASC LIMIT 1`,
      [artistId]
    );
    if (rows[0]) return rows[0];
    const [fallback] = await pool.execute(
      `SELECT ass.* FROM assignments ass
       WHERE ass.is_visible = 1
         AND ass.start_at <= datetime('now', 'localtime')
         AND (ass.target_scope = 'ALL' OR EXISTS (
           SELECT 1 FROM assignment_artists aa
           WHERE aa.assignment_id = ass.id AND aa.artist_id = ?
         ))
       ORDER BY ass.start_at DESC, ass.week DESC, ass.id DESC LIMIT 1`,
      [artistId]
    );
    return fallback[0] || null;
  },

  async findNext() {
    const [rows] = await pool.execute(
      `SELECT * FROM assignments
       WHERE is_visible = 1 AND start_at > datetime('now', 'localtime')
       ORDER BY start_at ASC, week ASC, id ASC LIMIT 1`
    );
    return rows[0] || null;
  },

  async findNextForArtist(artistId) {
    const [rows] = await pool.execute(
      `SELECT ass.* FROM assignments ass
       WHERE ass.is_visible = 1
         AND ass.start_at > datetime('now', 'localtime')
         AND (ass.target_scope = 'ALL' OR EXISTS (
           SELECT 1 FROM assignment_artists aa
           WHERE aa.assignment_id = ass.id AND aa.artist_id = ?
         ))
       ORDER BY ass.start_at ASC, ass.week ASC, ass.id ASC LIMIT 1`,
      [artistId]
    );
    return rows[0] || null;
  },

  async countTargetArtists(assignmentId) {
    const [rows] = await pool.execute(
      `SELECT COUNT(*) AS count
       FROM artists a
       JOIN assignments ass ON ass.id = ?
       WHERE a.status = 'ACTIVE'
         AND (ass.target_scope = 'ALL' OR EXISTS (
           SELECT 1 FROM assignment_artists aa
           WHERE aa.assignment_id = ass.id AND aa.artist_id = a.id
         ))`,
      [assignmentId]
    );
    return Number(rows[0].count);
  },

  async create(data) {
    const assignmentId = await withTransaction(async (connection) => {
      const [result] = connection.execute(
        `INSERT INTO assignments
         (week, title, topic, description, recommended_channel, start_at, due_at, is_visible, target_scope)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [data.week, data.title, data.topic, data.description || null, data.recommendedChannel || null,
          data.startAt, data.dueAt, data.isVisible ? 1 : 0, data.targetScope]
      );
      replaceTargets(connection, result.insertId, data.targetScope, data.artistIds);
      return result.insertId;
    });
    return this.findById(assignmentId);
  },

  async update(id, data) {
    await withTransaction(async (connection) => {
      connection.execute(
        `UPDATE assignments SET week = ?, title = ?, topic = ?, description = ?,
         recommended_channel = ?, start_at = ?, due_at = ?, is_visible = ?, target_scope = ?,
         updated_at = datetime('now', 'localtime') WHERE id = ?`,
        [data.week, data.title, data.topic, data.description || null, data.recommendedChannel || null,
          data.startAt, data.dueAt, data.isVisible ? 1 : 0, data.targetScope, id]
      );
      replaceTargets(connection, id, data.targetScope, data.artistIds);
    });
    return this.findById(id);
  },

  async toggleVisibility(id) {
    await pool.execute("UPDATE assignments SET is_visible = CASE WHEN is_visible = 1 THEN 0 ELSE 1 END, updated_at = datetime('now', 'localtime') WHERE id = ?", [id]);
    return this.findById(id);
  }
};

function replaceTargets(connection, assignmentId, targetScope, artistIds = []) {
  connection.execute('DELETE FROM assignment_artists WHERE assignment_id = ?', [assignmentId]);
  if (targetScope !== 'SELECTED') return;
  for (const artistId of artistIds) {
    connection.execute(
      `INSERT INTO assignment_artists (assignment_id, artist_id) VALUES (?, ?)`,
      [assignmentId, artistId]
    );
  }
}
