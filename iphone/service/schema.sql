PRAGMA foreign_keys=ON;
PRAGMA journal_mode=WAL;
PRAGMA busy_timeout=5000;
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  account_token TEXT NOT NULL UNIQUE,
  application_status TEXT NOT NULL DEFAULT 'draft' CHECK(application_status IN ('draft','pending','approved')),
  profile TEXT,
  paused INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS sessions (
  digest TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS application_consents (
  id INTEGER PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  version TEXT NOT NULL,
  received_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS member_application_consents ON application_consents(user_id,version);
CREATE TABLE IF NOT EXISTS transactions (
  transaction_id TEXT PRIMARY KEY,
  original_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  signed_at INTEGER NOT NULL,
  revoked INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS member_access ON transactions(user_id, expires_at);
CREATE INDEX IF NOT EXISTS original_transactions ON transactions(original_id);
CREATE TABLE IF NOT EXISTS introductions (
  id TEXT PRIMARY KEY,
  first_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  second_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  first_accept INTEGER NOT NULL DEFAULT 0,
  second_accept INTEGER NOT NULL DEFAULT 0,
  closed INTEGER NOT NULL DEFAULT 0,
  CHECK (first_id < second_id),
  UNIQUE (first_id, second_id)
);
CREATE TABLE IF NOT EXISTS blocks (
  reporter TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (reporter, subject)
);
CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  reporter TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  filed_at INTEGER NOT NULL,
  resolved_at INTEGER,
  UNIQUE(reporter,subject)
);
