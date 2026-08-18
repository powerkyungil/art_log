import { pool, withTransaction } from '../db/pool.js';

export const artistRepository = {
  async list({ search = '', status = '', limit = null, offset = 0 } = {}) {
    const { where, params } = artistFilter({ search, status });
    const pagination = Number.isInteger(limit) ? ' LIMIT ? OFFSET ?' : '';
    if (pagination) params.push(limit, offset);
    const [rows] = await pool.execute(
      `SELECT a.id, a.name, a.phone, a.access_token_version, a.status, a.created_at, a.updated_at
       FROM artists a ${where} ORDER BY a.name ASC, a.id DESC${pagination}`,
      params
    );
    return attachLinks(rows);
  },

  async count({ search = '', status = '' } = {}) {
    const { where, params } = artistFilter({ search, status });
    const [rows] = await pool.execute(`SELECT COUNT(*) AS count FROM artists a ${where}`, params);
    return Number(rows[0].count);
  },

  async findById(id) {
    const [rows] = await pool.execute(
      'SELECT * FROM artists WHERE id = ? LIMIT 1',
      [id]
    );
    return attachArtist(rows[0]);
  },

  async findByName(name) {
    const [rows] = await pool.execute(
      'SELECT * FROM artists WHERE name = ? ORDER BY id ASC LIMIT 1',
      [name]
    );
    return attachArtist(rows[0]);
  },

  async findOtherByName(name, id) {
    const [rows] = await pool.execute(
      'SELECT id FROM artists WHERE name = ? AND id <> ? LIMIT 1',
      [name, id]
    );
    return rows[0] || null;
  },

  async create({ name, phone, status, tokenHash, passwordHash, links = [] }) {
    const artistId = await withTransaction(async (connection) => {
      const [result] = connection.execute(
        `INSERT INTO artists (name, password_hash, phone, status, access_token_hash)
         VALUES (?, ?, ?, ?, ?)`,
        [name, passwordHash, phone || null, status || 'ACTIVE', tokenHash]
      );
      replaceLinks(connection, result.insertId, links);
      return result.insertId;
    });
    return this.findById(artistId);
  },

  async update(id, { name, phone, status, links = [] }) {
    await withTransaction(async (connection) => {
      connection.execute(
        `UPDATE artists SET name = ?, phone = ?, status = ?,
         updated_at = datetime('now', 'localtime') WHERE id = ?`,
        [name, phone || null, status, id]
      );
      replaceLinks(connection, id, links);
    });
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

  async delete(id) {
    return withTransaction(async (connection) => {
      connection.execute('DELETE FROM submissions WHERE artist_id = ?', [id]);
      connection.execute('DELETE FROM assignment_artists WHERE artist_id = ?', [id]);
      connection.execute('DELETE FROM artist_links WHERE artist_id = ?', [id]);
      const [result] = connection.execute('DELETE FROM artists WHERE id = ?', [id]);
      return Number(result.affectedRows || 0) > 0;
    });
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

function artistFilter({ search = '', status = '' } = {}) {
  const conditions = [];
  const params = [];
  if (search) {
    conditions.push(`(a.name LIKE ? OR a.phone LIKE ? OR EXISTS (
      SELECT 1 FROM artist_links al
      WHERE al.artist_id = a.id AND (al.platform LIKE ? OR al.url LIKE ?)
    ))`);
    const keyword = `%${search}%`;
    params.push(keyword, keyword, keyword, keyword);
  }
  if (status) {
    conditions.push('a.status = ?');
    params.push(status);
  }
  return {
    where: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '',
    params
  };
}

async function attachArtist(artist) {
  if (!artist) return null;
  const [withLinks] = await attachLinks([artist]);
  return withLinks;
}

async function attachLinks(artists) {
  if (!artists.length) return artists;
  const ids = artists.map((artist) => Number(artist.id));
  const placeholders = ids.map(() => '?').join(', ');
  const [rows] = await pool.execute(
    `SELECT id, artist_id, platform, url
     FROM artist_links
     WHERE artist_id IN (${placeholders})
     ORDER BY platform ASC, id ASC`,
    ids
  );
  const linksByArtist = new Map();
  rows.forEach((row) => {
    const key = Number(row.artist_id);
    if (!linksByArtist.has(key)) linksByArtist.set(key, []);
    linksByArtist.get(key).push(row);
  });
  return artists.map((artist) => ({
    ...artist,
    links: linksByArtist.get(Number(artist.id)) || []
  }));
}

function replaceLinks(connection, artistId, links = []) {
  connection.execute('DELETE FROM artist_links WHERE artist_id = ?', [artistId]);
  for (const link of links) {
    if (!link?.platform || !link?.url) continue;
    connection.execute(
      `INSERT OR IGNORE INTO artist_links (artist_id, platform, url) VALUES (?, ?, ?)`,
      [artistId, link.platform, link.url]
    );
  }
}
