-- Guest usage tracking: rate-limit unauthenticated users to N chats/day by IP hash.
-- IP addresses are SHA-256 hashed with a salt for privacy.

CREATE TABLE IF NOT EXISTS guest_usage (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ip_hash     text        NOT NULL,
  used_at     date        NOT NULL DEFAULT CURRENT_DATE,
  message_count int       NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ip_hash, used_at)
);

-- Index for fast lookup by ip_hash + date
CREATE INDEX IF NOT EXISTS idx_guest_usage_ip_date ON guest_usage (ip_hash, used_at);

-- RPC: get today's guest usage count for an IP hash
CREATE OR REPLACE FUNCTION get_guest_usage(p_ip_hash text)
RETURNS int
LANGUAGE sql STABLE
AS $$
  SELECT COALESCE(
    (SELECT message_count FROM guest_usage WHERE ip_hash = p_ip_hash AND used_at = CURRENT_DATE),
    0
  );
$$;

-- RPC: increment today's guest usage count (upsert)
CREATE OR REPLACE FUNCTION increment_guest_usage(p_ip_hash text)
RETURNS int
LANGUAGE sql VOLATILE
AS $$
  INSERT INTO guest_usage (ip_hash, used_at, message_count, updated_at)
  VALUES (p_ip_hash, CURRENT_DATE, 1, now())
  ON CONFLICT (ip_hash, used_at)
  DO UPDATE SET message_count = guest_usage.message_count + 1, updated_at = now()
  RETURNING message_count;
$$;

-- RLS: only service_role can access this table (no client access)
ALTER TABLE guest_usage ENABLE ROW LEVEL SECURITY;
-- No policies = deny all for anon/authenticated roles; service_role bypasses RLS.

-- Cleanup: auto-delete rows older than 7 days (run via cron or manually)
-- CREATE EXTENSION IF NOT EXISTS pg_cron;
-- SELECT cron.schedule('cleanup-guest-usage', '0 3 * * *', $$DELETE FROM guest_usage WHERE used_at < CURRENT_DATE - 7$$);
