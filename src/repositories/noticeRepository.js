import { pool } from '../db/pool.js';

export const noticeRepository = {
  async list({ includeHidden = true, limit = null, offset = 0 } = {}) {
    const where = includeHidden
      ? ''
      : "WHERE is_visible = 1 AND (published_at IS NULL OR published_at <= datetime('now', 'localtime'))";
    const params = [];
    const pagination = Number.isInteger(limit) ? ' LIMIT ? OFFSET ?' : '';
    if (pagination) params.push(limit, offset);
    const [rows] = await pool.execute(
      `SELECT * FROM notices ${where} ORDER BY is_pinned DESC, published_at DESC, id DESC${pagination}`,
      params
    );
    return rows;
  },

  async count({ includeHidden = true } = {}) {
    const where = includeHidden
      ? ''
      : "WHERE is_visible = 1 AND (published_at IS NULL OR published_at <= datetime('now', 'localtime'))";
    const [rows] = await pool.execute(`SELECT COUNT(*) AS count FROM notices ${where}`);
    return Number(rows[0].count);
  },

  async findById(id) {
    const [rows] = await pool.execute('SELECT * FROM notices WHERE id = ? LIMIT 1', [id]);
    return rows[0] || null;
  },

  async create(data) {
    const [result] = await pool.execute(
      `INSERT INTO notices (title, content, is_pinned, is_visible, published_at)
       VALUES (?, ?, ?, ?, ?)`,
      [data.title, data.content, data.isPinned ? 1 : 0, data.isVisible ? 1 : 0, data.publishedAt || null]
    );
    return this.findById(result.insertId);
  },

  async update(id, data) {
    await pool.execute(
      `UPDATE notices SET title = ?, content = ?, is_pinned = ?, is_visible = ?, published_at = ?,
       updated_at = datetime('now', 'localtime') WHERE id = ?`,
      [data.title, data.content, data.isPinned ? 1 : 0, data.isVisible ? 1 : 0, data.publishedAt || null, id]
    );
    return this.findById(id);
  },

  async toggleVisibility(id) {
    await pool.execute("UPDATE notices SET is_visible = CASE WHEN is_visible = 1 THEN 0 ELSE 1 END, updated_at = datetime('now', 'localtime') WHERE id = ?", [id]);
    return this.findById(id);
  },

  async delete(id) {
    const [result] = await pool.execute('DELETE FROM notices WHERE id = ?', [id]);
    return Number(result.affectedRows || 0) > 0;
  }
};
