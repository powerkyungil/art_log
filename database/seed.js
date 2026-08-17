import bcrypt from 'bcryptjs';
import '../src/config.js';
import { pool } from '../src/db/pool.js';

const loginId = process.env.ADMIN_LOGIN_ID || 'admin';
const password = process.env.ADMIN_PASSWORD || 'admin1234';
const name = process.env.ADMIN_NAME || '관리자';
const passwordHash = await bcrypt.hash(password, 12);

try {
  await pool.execute(
    `INSERT INTO users (login_id, password_hash, name, role)
     VALUES (?, ?, ?, 'ADMIN')
     ON CONFLICT(login_id) DO UPDATE SET password_hash = excluded.password_hash, name = excluded.name`,
    [loginId, passwordHash, name]
  );
  console.log(`Admin seed is ready: ${loginId}`);
} finally {
  await pool.end();
}
