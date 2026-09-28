-- sql/schema.sql — Postgres schema for the AI headshot generator.
--
-- Apply once per database:
--   psql "$DATABASE_URL" -f sql/schema.sql
--
-- The app also runs this automatically (CREATE TABLE IF NOT EXISTS) on
-- worker startup and lazily from lib/db.ts, so manual setup is only needed
-- for the very first deploy if you want it done ahead of time.

CREATE TABLE IF NOT EXISTS orders (
  id               TEXT PRIMARY KEY,
  name             TEXT NOT NULL,
  email            TEXT NOT NULL,
  pack             TEXT NOT NULL,              -- 'basic' | 'standard' | 'executive'
  status           TEXT NOT NULL,              -- awaiting_payment|paid|generating|complete|failed
  selfie_paths     JSONB NOT NULL DEFAULT '[]',-- public URLs (R2) once configured (local paths in dev)
  stripe_session_id TEXT,
  result_urls      JSONB,                      -- public URLs of finished headshots
  failure_error    TEXT,                       -- set when status='failed'
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS orders_email_idx ON orders (email);
CREATE INDEX IF NOT EXISTS orders_status_idx ON orders (status);

CREATE TABLE IF NOT EXISTS jobs (
  id          TEXT PRIMARY KEY,
  order_id    TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  status      TEXT NOT NULL DEFAULT 'pending', -- pending|running|done|failed
  attempts    INT  NOT NULL DEFAULT 0,
  run_after   TIMESTAMPTZ NOT NULL DEFAULT NOW(), -- backoff: don't claim before this
  error       TEXT,                             -- last error message
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS jobs_claim_idx ON jobs (status, run_after);

-- Simple fixed-window rate limiting (one row per key per day).
CREATE TABLE IF NOT EXISTS rate_limits (
  key          TEXT NOT NULL,   -- e.g. 'order:email:foo@bar.com:2026-09-24'
  window_start DATE NOT NULL,
  count        INT  NOT NULL DEFAULT 1,
  PRIMARY KEY (key, window_start)
);
