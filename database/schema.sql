PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  login_id TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'ADMIN' CHECK (role = 'ADMIN'),
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS artists (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  phone TEXT,
  access_token_hash TEXT NOT NULL UNIQUE,
  access_token_version INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE', 'COMPLETED')),
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE INDEX IF NOT EXISTS idx_artists_name ON artists (name);
CREATE INDEX IF NOT EXISTS idx_artists_status ON artists (status);

CREATE TABLE IF NOT EXISTS artist_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  artist_id INTEGER NOT NULL,
  platform TEXT NOT NULL,
  url TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  UNIQUE (artist_id, platform, url),
  FOREIGN KEY (artist_id) REFERENCES artists (id) ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_artist_links_artist ON artist_links (artist_id);

CREATE TABLE IF NOT EXISTS assignments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  round_no INTEGER NOT NULL UNIQUE CHECK (round_no > 0),
  title TEXT NOT NULL,
  topic TEXT NOT NULL,
  description TEXT,
  recommended_channel TEXT,
  start_at TEXT NOT NULL,
  due_at TEXT NOT NULL,
  is_visible INTEGER NOT NULL DEFAULT 0 CHECK (is_visible IN (0, 1)),
  target_scope TEXT NOT NULL DEFAULT 'ALL' CHECK (target_scope IN ('ALL', 'SELECTED')),
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE INDEX IF NOT EXISTS idx_assignments_visibility_dates ON assignments (is_visible, start_at, due_at);

CREATE TABLE IF NOT EXISTS assignment_artists (
  assignment_id INTEGER NOT NULL,
  artist_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  PRIMARY KEY (assignment_id, artist_id),
  FOREIGN KEY (assignment_id) REFERENCES assignments (id) ON UPDATE CASCADE ON DELETE CASCADE,
  FOREIGN KEY (artist_id) REFERENCES artists (id) ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_assignment_artists_artist ON assignment_artists (artist_id);

CREATE TABLE IF NOT EXISTS submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  artist_id INTEGER NOT NULL,
  assignment_id INTEGER NOT NULL,
  upload_date TEXT NOT NULL,
  upload_channel TEXT NOT NULL,
  post_url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'SUBMITTED' CHECK (status IN ('SUBMITTED', 'CONFIRMED')),
  submitted_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  confirmed_at TEXT,
  confirmed_by INTEGER,
  admin_memo TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  UNIQUE (artist_id, assignment_id),
  FOREIGN KEY (artist_id) REFERENCES artists (id) ON UPDATE CASCADE ON DELETE RESTRICT,
  FOREIGN KEY (assignment_id) REFERENCES assignments (id) ON UPDATE CASCADE ON DELETE RESTRICT,
  FOREIGN KEY (confirmed_by) REFERENCES users (id) ON UPDATE CASCADE ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_submissions_assignment_status ON submissions (assignment_id, status);

CREATE TABLE IF NOT EXISTS submission_urls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  submission_id INTEGER NOT NULL,
  url TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  UNIQUE (submission_id, url),
  FOREIGN KEY (submission_id) REFERENCES submissions (id) ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_submission_urls_submission ON submission_urls (submission_id, sort_order, id);

CREATE TABLE IF NOT EXISTS notices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  is_pinned INTEGER NOT NULL DEFAULT 0 CHECK (is_pinned IN (0, 1)),
  is_visible INTEGER NOT NULL DEFAULT 1 CHECK (is_visible IN (0, 1)),
  published_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE INDEX IF NOT EXISTS idx_notices_visibility ON notices (is_visible, is_pinned, published_at);
