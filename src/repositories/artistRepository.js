import { pool } from '../db/pool.js';

export const artistRepository = {
  async list({ search = '', status = '' } = {}) {
    const conditions = [];
    const params = [];
    if (search) {
      conditions.push('(name LIKE ? OR phone LIKE ? OR sns_account LIKE ?)');
      const keyword = `%${search}%`;
      params.push(keyword, keyword, keyword);
    }
    if (status) {
      conditions.push('status = ?');
      params.push(status);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const [rows] = await pool.execute(
      `SELECT id, name, phone, sns_account, access_token_version, status, created_at, updated_at
       FROM artists ${where} ORDER BY name ASC, id DESC`,
      params
    );
    return rows;
  },

  async findById(id) {
    const [rows] = await pool.execute(
      'SELECT * FROM artists WHERE id = ? LIMIT 1',
      [id]
    );
    return rows[0] || null;
  },

  async findByName(name) {
    const [rows] = await pool.execute(
      'SELECT * FROM artists WHERE name = ? ORDER BY id ASC LIMIT 1',
      [name]
    );
    return rows[0] || null;
  },

  async findOtherByName(name, id) {
    const [rows] = await pool.execute(
      'SELECT id FROM artists WHERE name = ? AND id <> ? LIMIT 1',
      [name, id]
    );
    return rows[0] || null;
  },

  async create({ name, phone, snsAccount, status, tokenHash, passwordHash }) {
    const [result] = await pool.execute(
      `INSERT INTO artists (name, password_hash, phone, sns_account, status, access_token_hash)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [name, passwordHash, phone || null, snsAccount || null, status || 'ACTIVE', tokenHash]
    );
    return this.findById(result.insertId);
  },

  async update(id, { name, phone, snsAccount, status }) {
    await pool.execute(
      `UPDATE artists SET name = ?, phone = ?, sns_account = ?, status = ?,
       updated_at = datetime('now', 'localtime') WHERE id = ?`,
      [name, phone || null, snsAccount || null, status, id]
    );
    return this.findById(id);
  },

  async updatePassword(id, passwordHash) {
    await pool.execute(
      `UPDATE artists SET password_hash = ?, access_token_version = access_token_version + 1,
       updated_at = datetime('now', 'localtime') WHERE id = ?`,
      [passwordHash, id]
    );
    return this.findById(id);
  },

  async countActive() {
    const [rows] = await pool.execute("SELECT COUNT(*) AS count FROM artists WHERE status = 'ACTIVE'");
    return Number(rows[0].count);
  },

  async findActiveByIds(ids = []) {
    const normalizedIds = [...new Set(ids.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0))];
    if (!normalizedIds.length) return [];
    const placeholders = normalizedIds.map(() => '?').join(', ');
    const [rows] = await pool.execute(
      `SELECT id, name, status FROM artists WHERE status = 'ACTIVE' AND id IN (${placeholders}) ORDER BY name ASC`,
      normalizedIds
    );
    return rows;
  }
};
