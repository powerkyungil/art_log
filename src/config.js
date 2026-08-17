import 'dotenv/config';
import path from 'node:path';

process.env.TZ = process.env.TIMEZONE || 'Asia/Seoul';

export const config = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 3000),
  appUrl: process.env.APP_URL || 'http://localhost:3000',
  sessionSecret: process.env.SESSION_SECRET || 'local-only-change-me',
  timezone: process.env.TIMEZONE || 'Asia/Seoul',
  db: {
    file: path.resolve(process.cwd(), process.env.DB_FILE || 'database/art_log.sqlite')
  }
};
