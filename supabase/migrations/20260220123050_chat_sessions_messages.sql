-- Reconciliation marker: the live DB has a migration recorded under version
-- 20260220123050 (chat_sessions_messages), applied in an earlier session before
-- the local migration files were renamed to the 20250219xxxxxx series. The same
-- logical migration is defined canonically in
-- 20250219000000_chat_sessions_messages.sql (idempotent: CREATE TABLE IF NOT
-- EXISTS for chat_sessions + chat_messages). This file is a no-op marker so the
-- remote version is represented in the local migrations directory and the
-- Supabase Preview CI reconciliation check passes. Do not re-run DDL here — the
-- tables already exist on the live DB and 20250219000000 owns the schema.

SELECT 'marker: 20260220123050 reconciled with local migrations dir' WHERE false;