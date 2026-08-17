import { pool } from '../db/pool.js';

export const userRepository = {
  async findByLoginId(loginId) {
    const [rows] = await pool.execute(
      'SELECT id, login_id, password_hash, name, role FROM users WHERE login_id = ? LIMIT 1',
      [loginId]
    );
    return rows[0] || null;
  },

  async findById(id) {
    const [rows] = await pool.execute(
      'SELECT id, login_id, name, role FROM users WHERE id = ? LIMIT 1',
      [id]
    );
    return rows[0] || null;
  }
};
