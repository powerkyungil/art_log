import { pool, withTransaction } from '../db/pool.js';
import { nowSql } from '../utils/format.js';

async function attachPostUrls(rows, idColumn = 'id') {
  const submissionIds = [...new Set(rows
    .map((row) => Number(row[idColumn]))
    .filter((id) => Number.isInteger(id) && id > 0))];
  const urlsBySubmission = new Map();

  if (submissionIds.length) {
    const placeholders = submissionIds.map(() => '?').join(', ');
    const [urlRows] = await pool.execute(
      `SELECT submission_id, url
       FROM submission_urls
       WHERE submission_id IN (${placeholders})
       ORDER BY submission_id ASC, sort_order ASC, id ASC`,
      submissionIds
    );
    urlRows.forEach((row) => {
      if (!urlsBySubmission.has(row.submission_id)) urlsBySubmission.set(row.submission_id, []);
      urlsBySubmission.get(row.submission_id).push(row.url);
    });
  }

  return rows.map((row) => {
    const urls = urlsBySubmission.get(Number(row[idColumn])) || [];
    return {
      ...row,
      post_urls: urls.length ? urls : row.post_url ? [row.post_url] : []
    };
  });
}

async function replacePostUrls(connection, submissionId, postUrls) {
  await connection.execute('DELETE FROM submission_urls WHERE submission_id = ?', [submissionId]);
  for (const [index, url] of postUrls.entries()) {
    await connection.execute(
      'INSERT INTO submission_urls (submission_id, url, sort_order) VALUES (?, ?, ?)',
      [submissionId, url, index]
    );
  }
}

export const submissionRepository = {
  async findById(id) {
    const [rows] = await pool.execute(
      `SELECT s.*, a.name AS artist_name, a.status AS artist_status,
              ass.round_no, ass.title AS assignment_title, ass.topic,
              ass.due_at, u.name AS confirmer_name
       FROM submissions s
       JOIN artists a ON a.id = s.artist_id
       JOIN assignments ass ON ass.id = s.assignment_id
       LEFT JOIN users u ON u.id = s.confirmed_by
       WHERE s.id = ? LIMIT 1`,
      [id]
    );
    const submissions = await attachPostUrls(rows);
    return submissions[0] || null;
  },

  async findByArtistAndAssignment(artistId, assignmentId) {
    const [rows] = await pool.execute(
      `SELECT s.*, ass.round_no, ass.title AS assignment_title, ass.topic, ass.due_at
       FROM submissions s JOIN assignments ass ON ass.id = s.assignment_id
       WHERE s.artist_id = ? AND s.assignment_id = ? LIMIT 1`,
      [artistId, assignmentId]
    );
    const submissions = await attachPostUrls(rows);
    return submissions[0] || null;
  },

  async listForArtist(artistId) {
    const [rows] = await pool.execute(
      `SELECT ass.id AS assignment_id, ass.round_no, ass.title, ass.topic, ass.start_at, ass.due_at,
              s.id AS submission_id, s.upload_date, s.upload_channel, s.post_url, s.status,
              s.submitted_at, s.updated_at
       FROM assignments ass
       LEFT JOIN submissions s ON s.assignment_id = ass.id AND s.artist_id = ?
       WHERE ass.is_visible = 1
       ORDER BY ass.round_no ASC, ass.start_at ASC, ass.id ASC`,
      [artistId]
    );
    return attachPostUrls(rows, 'submission_id');
  },

  async list({ search = '', status = '', assignmentId = '', channel = '' } = {}) {
    const conditions = [];
    const params = [];
    if (search) {
      conditions.push(`(a.name LIKE ? OR s.post_url LIKE ? OR EXISTS (
        SELECT 1 FROM submission_urls su_search
        WHERE su_search.submission_id = s.id AND su_search.url LIKE ?
      ))`);
      const keyword = `%${search}%`;
      params.push(keyword, keyword, keyword);
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
      `SELECT s.*, a.name AS artist_name, ass.round_no, ass.title AS assignment_title,
              ass.topic, ass.due_at
       FROM submissions s
       JOIN artists a ON a.id = s.artist_id
       JOIN assignments ass ON ass.id = s.assignment_id
       ${where}
       ORDER BY s.submitted_at DESC, s.id DESC`,
      params
    );
    return attachPostUrls(rows);
  },

  async create({ artistId, assignmentId, uploadDate, uploadChannel, postUrls }) {
    const timestamp = nowSql();
    const submissionId = await withTransaction(async (connection) => {
      const [result] = await connection.execute(
        `INSERT INTO submissions
         (artist_id, assignment_id, upload_date, upload_channel, post_url, status, submitted_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'SUBMITTED', ?, ?, ?)`,
        [artistId, assignmentId, uploadDate, uploadChannel, postUrls[0], timestamp, timestamp, timestamp]
      );
      await replacePostUrls(connection, result.insertId, postUrls);
      return result.insertId;
    });
    return this.findById(submissionId);
  },

  async updateByArtist(id, artistId, { uploadDate, uploadChannel, postUrls }) {
    await withTransaction(async (connection) => {
      const [result] = await connection.execute(
        `UPDATE submissions SET upload_date = ?, upload_channel = ?, post_url = ?, status = 'SUBMITTED',
         confirmed_at = NULL, confirmed_by = NULL, updated_at = ? WHERE id = ? AND artist_id = ? AND status <> 'CONFIRMED'`,
        [uploadDate, uploadChannel, postUrls[0], nowSql(), id, artistId]
      );
      if (result.affectedRows) await replacePostUrls(connection, id, postUrls);
    });
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
         AND s.status IN ('SUBMITTED', 'CONFIRMED')`,
      [assignmentId]
    );
    return Number(rows[0].count);
  },

  async dashboardRows() {
    const conditions = ["a.status = 'ACTIVE'", 'ass.is_visible = 1'];
    const [rows] = await pool.execute(
      `SELECT a.id AS artist_id, a.name AS artist_name, a.status AS artist_status,
              ass.id AS assignment_id, ass.round_no, ass.title AS assignment_title,
              ass.start_at, ass.due_at, s.id AS submission_id, s.status, s.post_url,
              s.submitted_at,
              1 AS is_applicable
       FROM artists a
       CROSS JOIN assignments ass
       LEFT JOIN submissions s ON s.artist_id = a.id AND s.assignment_id = ass.id
       WHERE ${conditions.join(' AND ')}
       ORDER BY a.name ASC, ass.round_no ASC, ass.start_at ASC, ass.id ASC`
    );
    return attachPostUrls(rows, 'submission_id');
  }
};
