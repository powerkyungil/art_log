import { pool } from '../db/pool.js';
import { nowSql } from '../utils/format.js';

export const submissionRepository = {
  async findById(id) {
    const [rows] = await pool.execute(
      `SELECT s.*, a.name AS artist_name, a.status AS artist_status,
              ass.week, ass.title AS assignment_title, ass.topic,
              ass.due_at, u.name AS confirmer_name
       FROM submissions s
       JOIN artists a ON a.id = s.artist_id
       JOIN assignments ass ON ass.id = s.assignment_id
       LEFT JOIN users u ON u.id = s.confirmed_by
       WHERE s.id = ? LIMIT 1`,
      [id]
    );
    return rows[0] || null;
  },

  async findByArtistAndAssignment(artistId, assignmentId) {
    const [rows] = await pool.execute(
      `SELECT s.*, ass.week, ass.title AS assignment_title, ass.topic, ass.due_at
       FROM submissions s JOIN assignments ass ON ass.id = s.assignment_id
       WHERE s.artist_id = ? AND s.assignment_id = ? LIMIT 1`,
      [artistId, assignmentId]
    );
    return rows[0] || null;
  },

  async listForArtist(artistId) {
    const [rows] = await pool.execute(
      `SELECT ass.id AS assignment_id, ass.week, ass.title, ass.topic, ass.start_at, ass.due_at,
              s.id AS submission_id, s.upload_date, s.upload_channel, s.post_url, s.status,
              s.submitted_at, s.updated_at
       FROM assignments ass
       LEFT JOIN submissions s ON s.assignment_id = ass.id AND s.artist_id = ?
       WHERE ass.is_visible = 1
         AND (ass.target_scope = 'ALL' OR EXISTS (
           SELECT 1 FROM assignment_artists aa
           WHERE aa.assignment_id = ass.id AND aa.artist_id = ?
         ) OR s.id IS NOT NULL)
       ORDER BY ass.week ASC, ass.start_at ASC, ass.id ASC`,
      [artistId, artistId]
    );
    return rows;
  },

  async list({ search = '', status = '', assignmentId = '', channel = '', month = '' } = {}) {
    const conditions = [];
    const params = [];
    if (month) {
      conditions.push('substr(s.submitted_at, 1, 7) = ?');
      params.push(month);
    }
    if (search) {
      conditions.push('(a.name LIKE ? OR s.post_url LIKE ?)');
      const keyword = `%${search}%`;
      params.push(keyword, keyword);
    }
    if (status) {
      conditions.push('s.status = ?');
      params.push(status);
    }
    if (assignmentId) {
      conditions.push('s.assignment_id = ?');
      params.push(assignmentId);
    }
    if (channel) {
      conditions.push('s.upload_channel = ?');
      params.push(channel);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const [rows] = await pool.execute(
      `SELECT s.*, a.name AS artist_name, ass.week, ass.title AS assignment_title,
              ass.topic, ass.due_at
       FROM submissions s
       JOIN artists a ON a.id = s.artist_id
       JOIN assignments ass ON ass.id = s.assignment_id
       ${where}
       ORDER BY s.submitted_at DESC, s.id DESC`,
      params
    );
    return rows;
  },

  async create({ artistId, assignmentId, uploadDate, uploadChannel, postUrl }) {
    const timestamp = nowSql();
    const [result] = await pool.execute(
      `INSERT INTO submissions
       (artist_id, assignment_id, upload_date, upload_channel, post_url, status, submitted_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'SUBMITTED', ?, ?, ?)`,
      [artistId, assignmentId, uploadDate, uploadChannel, postUrl, timestamp, timestamp, timestamp]
    );
    return this.findById(result.insertId);
  },

  async updateByArtist(id, artistId, { uploadDate, uploadChannel, postUrl }) {
    await pool.execute(
      `UPDATE submissions SET upload_date = ?, upload_channel = ?, post_url = ?, status = 'SUBMITTED',
       confirmed_at = NULL, confirmed_by = NULL, updated_at = ? WHERE id = ? AND artist_id = ? AND status <> 'CONFIRMED'`,
      [uploadDate, uploadChannel, postUrl, nowSql(), id, artistId]
    );
    return this.findById(id);
  },

  async updateByAdmin(id, { status, adminMemo, adminId }) {
    const timestamp = nowSql();
    const confirmedAt = status === 'CONFIRMED' ? timestamp : null;
    const confirmedBy = status === 'CONFIRMED' ? adminId : null;
    await pool.execute(
      `UPDATE submissions
       SET status = ?, admin_memo = ?, confirmed_at = ?, confirmed_by = ?, updated_at = ?
       WHERE id = ?`,
      [status, adminMemo || null, confirmedAt, confirmedBy, timestamp, id]
    );
    return this.findById(id);
  },

  async countForAssignment(assignmentId) {
    const [rows] = await pool.execute(
      `SELECT COUNT(*) AS count
       FROM submissions s
       JOIN artists a ON a.id = s.artist_id
       JOIN assignments ass ON ass.id = s.assignment_id
       WHERE s.assignment_id = ?
         AND a.status = 'ACTIVE'
         AND s.status IN ('SUBMITTED', 'CONFIRMED')
         AND (ass.target_scope = 'ALL' OR EXISTS (
           SELECT 1 FROM assignment_artists aa
           WHERE aa.assignment_id = ass.id AND aa.artist_id = a.id
         ))`,
      [assignmentId]
    );
    return Number(rows[0].count);
  },

  async dashboardRows({ month = '' } = {}) {
    const conditions = ['a.status <> \'INACTIVE\'', 'ass.is_visible = 1'];
    const params = [];
    if (month) {
      conditions.push('substr(ass.start_at, 1, 7) = ?');
      params.push(month);
    }
    const [rows] = await pool.execute(
      `SELECT a.id AS artist_id, a.name AS artist_name, a.status AS artist_status,
              ass.id AS assignment_id, ass.week, ass.title AS assignment_title,
              ass.start_at, ass.due_at, s.id AS submission_id, s.status, s.post_url,
              s.submitted_at,
              CASE WHEN ass.target_scope = 'ALL'
                     OR EXISTS (
                       SELECT 1 FROM assignment_artists aa
                       WHERE aa.assignment_id = ass.id AND aa.artist_id = a.id
                     )
                     OR s.id IS NOT NULL
                   THEN 1 ELSE 0 END AS is_applicable
       FROM artists a
       CROSS JOIN assignments ass
       LEFT JOIN submissions s ON s.artist_id = a.id AND s.assignment_id = ass.id
       WHERE ${conditions.join(' AND ')}
       ORDER BY a.name ASC, ass.week ASC, ass.start_at ASC, ass.id ASC`,
      params
    );
    return rows;
  }
};
