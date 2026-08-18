import { pool, withTransaction } from '../db/pool.js';

export const assignmentRepository = {
  async list({ includeHidden = true, limit = null, offset = 0, order = 'asc' } = {}) {
    const conditions = [];
    const params = [];
    if (!includeHidden) conditions.push('ass.is_visible = 1');
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const pagination = Number.isInteger(limit) ? ' LIMIT ? OFFSET ?' : '';
    const direction = order === 'desc' ? 'DESC' : 'ASC';
    if (pagination) params.push(limit, offset);
    const [rows] = await pool.execute(
      `SELECT ass.*
       FROM assignments ass
       ${where}
       ORDER BY ass.round_no ${direction}, ass.start_at ${direction}, ass.id ${direction}${pagination}`,
      params
    );
    return rows;
  },

  async count({ includeHidden = true } = {}) {
    const where = includeHidden ? '' : 'WHERE ass.is_visible = 1';
    const [rows] = await pool.execute(`SELECT COUNT(*) AS count FROM assignments ass ${where}`);
    return Number(rows[0].count);
  },

  async nextRoundNo() {
    const [rows] = await pool.execute('SELECT COALESCE(MAX(round_no), 0) + 1 AS next_round_no FROM assignments');
    return Number(rows[0]?.next_round_no || 1);
  },

  async findById(id) {
    const [rows] = await pool.execute('SELECT * FROM assignments WHERE id = ? LIMIT 1', [id]);
    return rows[0] || null;
  },

  async findByIdForArtist(assignmentId) {
    const [rows] = await pool.execute(
      `SELECT ass.* FROM assignments ass
       WHERE ass.id = ? AND ass.is_visible = 1
       LIMIT 1`,
      [assignmentId]
    );
    return rows[0] || null;
  },

  async findCurrent() {
    const [rows] = await pool.execute(
      `SELECT * FROM assignments
       WHERE is_visible = 1 AND start_at <= datetime('now', 'localtime') AND due_at >= datetime('now', 'localtime')
       ORDER BY round_no ASC, start_at ASC, id ASC LIMIT 1`
    );
    if (rows[0]) return rows[0];
    const [fallback] = await pool.execute(
      `SELECT * FROM assignments
       WHERE is_visible = 1 AND start_at <= datetime('now', 'localtime')
       ORDER BY start_at DESC, round_no DESC, id DESC LIMIT 1`
    );
    return fallback[0] || null;
  },

  async findCurrentForArtist() {
    const [rows] = await pool.execute(
      `SELECT ass.* FROM assignments ass
       WHERE ass.is_visible = 1
         AND ass.start_at <= datetime('now', 'localtime')
         AND ass.due_at >= datetime('now', 'localtime')
       ORDER BY ass.round_no ASC, ass.start_at ASC, ass.id ASC LIMIT 1`,
      []
    );
    if (rows[0]) return rows[0];
    const [fallback] = await pool.execute(
      `SELECT ass.* FROM assignments ass
       WHERE ass.is_visible = 1
         AND ass.start_at <= datetime('now', 'localtime')
       ORDER BY ass.start_at DESC, ass.round_no DESC, ass.id DESC LIMIT 1`,
      []
    );
    return fallback[0] || null;
  },

  async findNext() {
    const [rows] = await pool.execute(
      `SELECT * FROM assignments
       WHERE is_visible = 1 AND start_at > datetime('now', 'localtime')
       ORDER BY start_at ASC, round_no ASC, id ASC LIMIT 1`
    );
    return rows[0] || null;
  },

  async findNextForArtist() {
    const [rows] = await pool.execute(
      `SELECT ass.* FROM assignments ass
       WHERE ass.is_visible = 1
         AND ass.start_at > datetime('now', 'localtime')
       ORDER BY ass.start_at ASC, ass.round_no ASC, ass.id ASC LIMIT 1`,
      []
    );
    return rows[0] || null;
  },

  async create(data) {
    const assignmentId = await withTransaction(async (connection) => {
      const [roundRows] = connection.execute('SELECT COALESCE(MAX(round_no), 0) + 1 AS next_round_no FROM assignments');
      const roundNo = Number(roundRows[0]?.next_round_no || 1);
      const [result] = connection.execute(
        `INSERT INTO assignments
         (round_no, title, topic, description, recommended_channel, start_at, due_at, is_visible, target_scope)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [roundNo, data.title, data.topic, data.description || null, data.recommendedChannel || null,
          data.startAt, data.dueAt, data.isVisible ? 1 : 0, 'ALL']
      );
      return result.insertId;
    });
    return this.findById(assignmentId);
  },

  async update(id, data) {
    await withTransaction(async (connection) => {
      connection.execute(
        `UPDATE assignments SET title = ?, topic = ?, description = ?,
         recommended_channel = ?, start_at = ?, due_at = ?, is_visible = ?, target_scope = ?,
         updated_at = datetime('now', 'localtime') WHERE id = ?`,
        [data.title, data.topic, data.description || null, data.recommendedChannel || null,
          data.startAt, data.dueAt, data.isVisible ? 1 : 0, 'ALL', id]
      );
      connection.execute('DELETE FROM assignment_artists WHERE assignment_id = ?', [id]);
    });
    return this.findById(id);
  },

  async toggleVisibility(id) {
    await pool.execute("UPDATE assignments SET is_visible = CASE WHEN is_visible = 1 THEN 0 ELSE 1 END, updated_at = datetime('now', 'localtime') WHERE id = ?", [id]);
    return this.findById(id);
  },

  async delete(id) {
    return withTransaction(async (connection) => {
      connection.execute('DELETE FROM submissions WHERE assignment_id = ?', [id]);
      connection.execute('DELETE FROM assignment_artists WHERE assignment_id = ?', [id]);
      const [result] = connection.execute('DELETE FROM assignments WHERE id = ?', [id]);
      return Number(result.affectedRows || 0) > 0;
    });
  }
};
