-- PROPOSAL ONLY / UNAPPLIED. Review/test/apply separately with privileged migration tooling.
-- Requires the original published_articles migration. Never execute at build.
-- Canonical build snapshot identity/time is NOT Vercel deployment identity/time.
BEGIN;
ALTER TABLE public.published_articles ALTER COLUMN publish_date DROP NOT NULL;
ALTER TABLE public.published_articles
  ADD COLUMN IF NOT EXISTS modified_date date,
  ADD COLUMN IF NOT EXISTS publication_state text NOT NULL DEFAULT 'unverified',
  ADD COLUMN IF NOT EXISTS first_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS removed_at timestamptz,
  ADD COLUMN IF NOT EXISTS source_commit_sha text,
  ADD COLUMN IF NOT EXISTS canonical_snapshot_id text,
  ADD COLUMN IF NOT EXISTS canonical_snapshot_built_at timestamptz,
  ADD COLUMN IF NOT EXISTS verification_method text,
  ADD COLUMN IF NOT EXISTS deployment_id text,
  ADD COLUMN IF NOT EXISTS deployment_created_at timestamptz,
  ADD COLUMN IF NOT EXISTS vercel_verified_at timestamptz;

CREATE TABLE IF NOT EXISTS public.article_publication_checkpoint (
  scope text PRIMARY KEY CHECK (scope = 'www.inbharat.ai'),
  canonical_snapshot_id text NOT NULL CHECK (canonical_snapshot_id ~ '^[a-f0-9]{64}$'),
  canonical_snapshot_built_at timestamptz NOT NULL,
  source_commit_sha text NOT NULL CHECK (source_commit_sha ~ '^[a-f0-9]{40}$'),
  verified_at timestamptz NOT NULL,
  -- Optional operator-only Vercel evidence. Automatic runs never invent these.
  deployment_id text,
  deployment_created_at timestamptz,
  vercel_verified_at timestamptz
);
ALTER TABLE public.article_publication_checkpoint ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.article_publication_observations (
  snapshot_id text NOT NULL,
  source_commit_sha text NOT NULL,
  observed_at timestamptz NOT NULL,
  snapshot_built_at timestamptz NOT NULL,
  previous_snapshot_id text,
  transition text NOT NULL CHECK (transition IN ('initial', 'repeat', 'advance', 'rollback')),
  PRIMARY KEY (snapshot_id, observed_at)
);
ALTER TABLE public.article_publication_observations ENABLE ROW LEVEL SECURITY;


CREATE OR REPLACE FUNCTION public.reconcile_production_articles(snapshot jsonb)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE
  observed timestamptz := (snapshot->>'verified_at')::timestamptz;
  built timestamptz := (snapshot->>'snapshot_built_at')::timestamptz;
  identity text := snapshot->>'snapshot_id';
  commit_sha text := snapshot->>'source_commit_sha';
  vercel jsonb := snapshot->'vercel_verification';
  deployment text := snapshot->'vercel_verification'->>'deployment_id';
  deployed timestamptz := (snapshot->'vercel_verification'->>'deployment_created_at')::timestamptz;
  vercel_observed timestamptz := (snapshot->'vercel_verification'->>'verified_at')::timestamptz;
  previous public.article_publication_checkpoint%ROWTYPE;
  transition_kind text;
BEGIN
  -- service_role only (grants below); serialize all upserts, tombstones and checkpoint.
  PERFORM pg_advisory_xact_lock(hashtext('inbharat-production-article-snapshot'));
  IF snapshot->>'verification_method' IS DISTINCT FROM 'canonical_snapshot'
     OR jsonb_typeof(snapshot->'rows') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Invalid canonical snapshot';
  END IF;
  IF jsonb_array_length(snapshot->'rows') = 0 OR jsonb_array_length(snapshot->'rows') > 1000
     OR identity IS NULL OR identity !~ '^[a-f0-9]{64}$'
     OR commit_sha IS NULL OR commit_sha !~ '^[a-f0-9]{40}$'
     OR observed IS NULL OR built IS NULL OR NOT isfinite(observed) OR NOT isfinite(built)
     OR built > observed OR observed > now() + interval '5 minutes' THEN
    RAISE EXCEPTION 'Invalid canonical snapshot identity/time';
  END IF;
  IF vercel IS NOT NULL AND (jsonb_typeof(vercel) IS DISTINCT FROM 'object'
     OR deployment IS NULL OR deployment !~ '^dpl_[A-Za-z0-9]+$'
     OR deployed IS NULL OR vercel_observed IS NULL OR NOT isfinite(deployed) OR NOT isfinite(vercel_observed)
     OR deployed > vercel_observed OR vercel_observed > observed) THEN
    RAISE EXCEPTION 'Invalid optional Vercel verification';
  END IF;
  SELECT * INTO previous FROM public.article_publication_checkpoint WHERE scope = 'www.inbharat.ai';
  transition_kind := CASE WHEN NOT FOUND THEN 'initial'
    WHEN identity = previous.canonical_snapshot_id THEN 'repeat'
    WHEN built < previous.canonical_snapshot_built_at THEN 'rollback' ELSE 'advance' END;
  -- Order observations, not artifact creation times. A fresh canonical check
  -- after an owner rollback must converge to the older, now-current snapshot.
  IF previous.scope IS NOT NULL AND (observed < previous.verified_at
      OR (observed = previous.verified_at AND identity <> previous.canonical_snapshot_id)
      OR (identity = previous.canonical_snapshot_id AND
          (built <> previous.canonical_snapshot_built_at OR commit_sha <> previous.source_commit_sha))) THEN
    RAISE EXCEPTION 'Stale or conflicting canonical observation';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_to_recordset(snapshot->'rows') AS r(slug text, title text, canonical_url text,
      platform text, syndication_type text, publish_date date, modified_date date, source_meta_sha text, keywords text[])
    WHERE r.slug IS NULL OR r.slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
      OR r.title IS NULL OR btrim(r.title) = '' OR r.keywords IS NULL
      OR r.source_meta_sha IS NULL OR r.source_meta_sha !~ '^[a-f0-9]{64}$'
      OR r.canonical_url IS DISTINCT FROM 'https://www.inbharat.ai/learn-ai-with-reeturaj/' || r.slug
      OR r.platform IS DISTINCT FROM 'inbharat' OR r.syndication_type IS DISTINCT FROM 'original'
      OR (r.publish_date IS NOT NULL AND NOT isfinite(r.publish_date))
      OR (r.modified_date IS NOT NULL AND NOT isfinite(r.modified_date))
      OR r.publish_date > (observed AT TIME ZONE 'UTC')::date OR r.modified_date > (observed AT TIME ZONE 'UTC')::date
      OR r.modified_date < r.publish_date
  ) OR (SELECT count(*) FROM jsonb_array_elements(snapshot->'rows')) <>
       (SELECT count(DISTINCT r->>'slug') FROM jsonb_array_elements(snapshot->'rows') r) THEN
    RAISE EXCEPTION 'Invalid article rows';
  END IF;
  IF EXISTS (SELECT 1 FROM public.published_articles p JOIN jsonb_array_elements(snapshot->'rows') r ON p.slug = r->>'slug'
             WHERE p.platform IS DISTINCT FROM 'inbharat' OR p.syndication_type IS DISTINCT FROM 'original') THEN
    RAISE EXCEPTION 'Article slug conflicts with another platform';
  END IF;
  INSERT INTO public.published_articles AS old
    (slug, title, canonical_url, publish_date, modified_date, category, keywords, platform, syndication_type,
     source_meta_sha, synced_at, publication_state, first_verified_at, verified_at, removed_at, source_commit_sha,
     canonical_snapshot_id, canonical_snapshot_built_at, verification_method, deployment_id, deployment_created_at, vercel_verified_at)
  SELECT r.slug, r.title, r.canonical_url, r.publish_date, r.modified_date, r.category, r.keywords, r.platform, r.syndication_type,
     r.source_meta_sha, observed, 'live', observed, observed, NULL, commit_sha,
     identity, built, 'canonical_snapshot', deployment, deployed, vercel_observed
  FROM jsonb_to_recordset(snapshot->'rows') AS r(slug text, title text, canonical_url text, publish_date date,
     modified_date date, category text, keywords text[], platform text, syndication_type text, source_meta_sha text)
  ON CONFLICT (slug) DO UPDATE SET
    title = excluded.title, canonical_url = excluded.canonical_url,
    publish_date = COALESCE(old.publish_date, excluded.publish_date),
    modified_date = excluded.modified_date, category = excluded.category,
    keywords = excluded.keywords, source_meta_sha = excluded.source_meta_sha,
    synced_at = observed, publication_state = 'live', first_verified_at = COALESCE(old.first_verified_at, observed),
    verified_at = observed, removed_at = NULL, source_commit_sha = commit_sha,
    canonical_snapshot_id = identity, canonical_snapshot_built_at = built, verification_method = 'canonical_snapshot',
    deployment_id = CASE WHEN deployment IS NOT NULL THEN deployment WHEN old.canonical_snapshot_id = identity THEN old.deployment_id ELSE NULL END,
    deployment_created_at = CASE WHEN deployment IS NOT NULL THEN deployed WHEN old.canonical_snapshot_id = identity THEN old.deployment_created_at ELSE NULL END,
    vercel_verified_at = CASE WHEN deployment IS NOT NULL THEN vercel_observed WHEN old.canonical_snapshot_id = identity THEN old.vercel_verified_at ELSE NULL END
  WHERE old.platform = 'inbharat' AND old.syndication_type = 'original';

  -- Only canonical originals are managed. Syndication columns/foreign rows survive unchanged.
  -- Removed rows remain queryable; first verification/publication dates are never reset.
  UPDATE public.published_articles p SET publication_state = 'removed', removed_at = COALESCE(p.removed_at, observed),
    synced_at = observed, verified_at = observed, source_commit_sha = commit_sha,
    canonical_snapshot_id = identity, canonical_snapshot_built_at = built, verification_method = 'canonical_snapshot',
    deployment_id = CASE WHEN deployment IS NOT NULL THEN deployment WHEN p.canonical_snapshot_id = identity THEN p.deployment_id ELSE NULL END,
    deployment_created_at = CASE WHEN deployment IS NOT NULL THEN deployed WHEN p.canonical_snapshot_id = identity THEN p.deployment_created_at ELSE NULL END,
    vercel_verified_at = CASE WHEN deployment IS NOT NULL THEN vercel_observed WHEN p.canonical_snapshot_id = identity THEN p.vercel_verified_at ELSE NULL END
  WHERE p.platform = 'inbharat' AND p.syndication_type = 'original'
    AND p.canonical_url = 'https://www.inbharat.ai/learn-ai-with-reeturaj/' || p.slug
    AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(snapshot->'rows') r WHERE r->>'slug' = p.slug);

  INSERT INTO public.article_publication_observations
    (snapshot_id, source_commit_sha, observed_at, snapshot_built_at, previous_snapshot_id, transition)
  VALUES (identity, commit_sha, observed, built, previous.canonical_snapshot_id, transition_kind)
  ON CONFLICT (snapshot_id, observed_at) DO NOTHING;

  INSERT INTO public.article_publication_checkpoint AS old
    (scope, canonical_snapshot_id, canonical_snapshot_built_at, source_commit_sha, verified_at, deployment_id, deployment_created_at, vercel_verified_at)
  VALUES ('www.inbharat.ai', identity, built, commit_sha, observed, deployment, deployed, vercel_observed)
  ON CONFLICT (scope) DO UPDATE SET canonical_snapshot_id = identity, canonical_snapshot_built_at = built,
    source_commit_sha = commit_sha, verified_at = observed,
    deployment_id = CASE WHEN deployment IS NOT NULL THEN deployment WHEN old.canonical_snapshot_id = identity THEN old.deployment_id ELSE NULL END,
    deployment_created_at = CASE WHEN deployment IS NOT NULL THEN deployed WHEN old.canonical_snapshot_id = identity THEN old.deployment_created_at ELSE NULL END,
    vercel_verified_at = CASE WHEN deployment IS NOT NULL THEN vercel_observed WHEN old.canonical_snapshot_id = identity THEN old.vercel_verified_at ELSE NULL END;
END;
$$;
REVOKE ALL ON FUNCTION public.reconcile_production_articles(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_production_articles(jsonb) TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.article_publication_checkpoint TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.published_articles TO service_role;
GRANT SELECT, INSERT ON public.article_publication_observations TO service_role;
COMMIT;
