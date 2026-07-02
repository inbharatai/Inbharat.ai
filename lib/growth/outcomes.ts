/**
 * InBharat Growth Agent — Module: Outcome tracking (the learning signal).
 *
 * When a draft flips to 'published' (publish.ts), seedOutcomeOnPublish() records
 * the article's current SEO/GEO + issues as a BASELINE. The daily cron's
 * measureOutcomes() re-audits the article (reuse auditSingleUrl) and diffs the
 * fresh scores vs the baseline — the delta is the outcome the agent learns from.
 * Optional per-URL GSC deltas (when provisioned) + manual founder-entered
 * LinkedIn engagement complete the signal.
 *
 * Never throws; degrades to no-ops when supabaseAdmin is null (hermetic tests
 * with no DB stay green). Never publishes or edits the live site — audit-only.
 *
 * Server-only. Never touches the chat backend.
 */
import { supabaseAdmin } from "../../api/lib/supabaseAdmin.js";
import { logInfo, logError } from "./authorization.js";
import { auditSingleUrl } from "./audit-runner.js";
import { getGscPageMetrics, type GscPageRow } from "./performance.js";
import type { AuditIssue } from "./types.js";

export interface OutcomeBaseline {
  seo: number | null;
  geo: number | null;
  issues: AuditIssue[] | null;
}
export interface OutcomeMeasured {
  seo: number | null;
  geo: number | null;
  issues: AuditIssue[] | null;
}
export interface OutcomeDelta {
  seoDelta: number | null;
  geoDelta: number | null;
  issuesResolved: number;
  issuesNew: number;
}

/** Pure delta math on baseline vs measured snapshots. Hermetically testable.
 *  Returns null deltas when either side is null (e.g. no baseline yet). */
export function diffOutcomes(baseline: OutcomeBaseline, measured: OutcomeMeasured): OutcomeDelta {
  const seoDelta =
    baseline.seo != null && measured.seo != null ? measured.seo - baseline.seo : null;
  const geoDelta =
    baseline.geo != null && measured.geo != null ? measured.geo - baseline.geo : null;
  const bIssues = baseline.issues ?? [];
  const mIssues = measured.issues ?? [];
  const bSet = new Set(bIssues.map(issueKey));
  const mSet = new Set(mIssues.map(issueKey));
  const issuesResolved = bIssues.filter((i) => !mSet.has(issueKey(i))).length;
  const issuesNew = mIssues.filter((i) => !bSet.has(issueKey(i))).length;
  return { seoDelta, geoDelta, issuesResolved, issuesNew };
}

/** Stable key for an issue (severity+field+message) so deltas compare meaningfully. */
function issueKey(i: AuditIssue): string {
  return `${i.severity}|${i.field}|${i.message}`;
}

/**
 * Called from publish.ts after the draft flips to 'published'. Idempotent — if
 * an outcome row already exists for this draft, returns (a re-publish of the
 * same draft is a no-op). Snapshots the latest growth_pages row for the URL as
 * the baseline (null if the article was never audited before publish).
 */
export async function seedOutcomeOnPublish(
  draftId: string,
  url: string,
  kind: string,
): Promise<void> {
  if (!supabaseAdmin) return;
  try {
    const { data: existing } = await supabaseAdmin
      .from("growth_outcomes")
      .select("id")
      .eq("draft_id", draftId)
      .limit(1);
    if (Array.isArray(existing) && existing.length > 0) return; // already seeded

    let baselineSeo: number | null = null;
    let baselineGeo: number | null = null;
    let baselineIssues: AuditIssue[] | null = null;
    let baselinePageId: string | null = null;
    const { data: page } = await supabaseAdmin
      .from("growth_pages")
      .select("id,seo_score,geo_score,issues")
      .eq("url", url)
      .order("crawled_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (page) {
      baselineSeo = typeof page.seo_score === "number" ? page.seo_score : null;
      baselineGeo = typeof page.geo_score === "number" ? page.geo_score : null;
      baselineIssues = Array.isArray(page.issues) ? (page.issues as AuditIssue[]) : null;
      baselinePageId = typeof page.id === "string" ? page.id : null;
    }

    await supabaseAdmin.from("growth_outcomes").insert({
      draft_id: draftId,
      url,
      kind,
      published_at: new Date().toISOString(),
      baseline_seo: baselineSeo,
      baseline_geo: baselineGeo,
      baseline_issues: baselineIssues,
      baseline_page_id: baselinePageId,
    });
    // Bust the admin outcomes cache so the just-published article appears in
    // the Learning/Outcomes view immediately — previously the cache only busted
    // on measure/engagement, so the admin view was stale right after publish.
    bustOutcomesCache();
  } catch (e) {
    await logError("outcome-seed-fail", url, (e as Error).message).catch(() => undefined);
  }
}

/**
 * Daily cron: re-audit published articles whose outcomes are unmeasured and at
 * least 2 days old (give the re-audit + search engines time), then diff vs the
 * publish-time baseline and persist measured_*. Optional per-URL GSC deltas
 * when configured. Caps at 20/run. Never throws; per-URL failures are logged.
 */
export async function measureOutcomes(): Promise<{ measured: number; errors: number }> {
  if (!supabaseAdmin) return { measured: 0, errors: 0 };
  let outcomes: { id: string; url: string; baseline_seo: number | null; baseline_geo: number | null; baseline_issues: AuditIssue[] | null }[] = [];
  try {
    const { data, error } = await supabaseAdmin
      .from("growth_outcomes")
      .select("id,url,baseline_seo,baseline_geo,baseline_issues")
      .is("measured_at", null)
      .lt("published_at", new Date(Date.now() - 2 * 86400000).toISOString())
      .order("published_at", { ascending: true })
      .limit(20);
    if (error || !Array.isArray(data)) return { measured: 0, errors: 0 };
    outcomes = data as typeof outcomes;
  } catch {
    return { measured: 0, errors: 0 };
  }

  // Optional per-URL GSC ground truth (Phase 3). One fetch for the run; lookups
  // by URL below. Swallow entirely — GSC is a nice-to-have enrichment.
  let gscPages: Map<string, GscPageRow> | null = null;
  try {
    const gsc = await getGscPageMetrics(28, 100);
    if (gsc.configured && gsc.pages) {
      gscPages = new Map(gsc.pages.map((p) => [p.url, p]));
    }
  } catch {
    gscPages = null;
  }

  let measured = 0;
  let errors = 0;
  for (const o of outcomes) {
    try {
      const page = await auditSingleUrl(o.url); // re-audits + persists a fresh growth_pages row
      const baseline: OutcomeBaseline = {
        seo: o.baseline_seo,
        geo: o.baseline_geo,
        issues: o.baseline_issues,
      };
      const measuredSnap: OutcomeMeasured = {
        seo: page.seoScore,
        geo: page.geoScore,
        issues: page.issues,
      };
      const patch: Record<string, unknown> = {
        measured_seo: page.seoScore,
        measured_geo: page.geoScore,
        measured_issues: page.issues,
        measured_at: new Date().toISOString(),
      };
      if (gscPages) {
        const g = gscPages.get(o.url);
        if (g) {
          patch.gsc_clicks = g.clicks;
          patch.gsc_impressions = g.impressions;
          patch.gsc_ctr = g.ctr;
          patch.gsc_position = g.position;
        }
      }
      await supabaseAdmin.from("growth_outcomes").update(patch).eq("id", o.id);
      const d = diffOutcomes(baseline, measuredSnap);
      await logInfo(
        "outcome-measure-ok",
        o.url,
        `seo ${baseline.seo ?? "—"}→${page.seoScore} (Δ${d.seoDelta ?? "—"}), issues resolved ${d.issuesResolved}`,
      );
      measured++;
    } catch (e) {
      errors++;
      await logError("outcome-measure-fail", o.url, (e as Error).message).catch(() => undefined);
    }
  }
  bustOutcomesCache();
  return { measured, errors };
}

// ─── admin GET cache (cached-read pattern, empty fallback) ───

export interface OutcomeView {
  id: string;
  draftId: string | null;
  url: string;
  kind: string;
  publishedAt: string;
  title: string | null;
  baseline: { seo: number | null; geo: number | null };
  measured: { seo: number | null; geo: number | null; measuredAt: string | null };
  gsc: { clicks: number | null; impressions: number | null; ctr: number | null; position: number | null };
  linkedinEngagement: unknown;
  seoDelta: number | null;
  geoDelta: number | null;
  issuesResolved: number;
  critiqueStatus: string | null;
}

let outcomesCache: OutcomeView[] | null = null;

/** Invalidate the outcomes cache after a write (manual engagement / measurement). */
export function bustOutcomesCache(): void {
  outcomesCache = null;
}

/** Load the outcomes list joined to growth_drafts for the title + critique
 *  status. Cached; empty on DB absent/error. */
export async function loadOutcomes(): Promise<OutcomeView[]> {
  if (outcomesCache) return outcomesCache;
  const out: OutcomeView[] = [];
  if (!supabaseAdmin) return out;
  try {
    const { data, error } = await supabaseAdmin
      .from("growth_outcomes")
      .select(
        "id,draft_id,url,kind,published_at,baseline_seo,baseline_geo,measured_seo,measured_geo,measured_at,gsc_clicks,gsc_impressions,gsc_ctr,gsc_position,linkedin_engagement,baseline_issues,measured_issues",
      )
      .order("published_at", { ascending: false })
      .limit(100);
    if (error || !Array.isArray(data)) return out;

    // Batch-fetch the linked drafts for titles + critique status.
    const draftIds = (data as { draft_id: string | null }[])
      .map((r) => r.draft_id)
      .filter((x): x is string => typeof x === "string");
    const draftMap = new Map<string, { title: string | null; critiqueStatus: string | null }>();
    if (draftIds.length) {
      const { data: drafts } = await supabaseAdmin
        .from("growth_drafts")
        .select("id,title,schema_json")
        .in("id", draftIds);
      for (const d of (drafts as { id: string; title: string | null; schema_json: unknown }[]) ?? []) {
        const sj = (d.schema_json ?? null) as { critique?: { status?: string } } | null;
        draftMap.set(d.id, {
          title: d.title,
          critiqueStatus: sj?.critique?.status ?? null,
        });
      }
    }

    for (const r of data as Record<string, unknown>[]) {
      const draftId = (r.draft_id as string | null) ?? null;
      const d = draftId ? draftMap.get(draftId) : null;
      const baselineSeo = (r.baseline_seo as number | null) ?? null;
      const baselineGeo = (r.baseline_geo as number | null) ?? null;
      const measuredSeo = (r.measured_seo as number | null) ?? null;
      const measuredGeo = (r.measured_geo as number | null) ?? null;
      // Real issues-resolved count from the stored baseline vs measured issue
      // arrays (previously hardcoded 0 with a misleading comment). Null when
      // either side hasn't been measured yet.
      const baselineIssues = Array.isArray(r.baseline_issues) ? (r.baseline_issues as AuditIssue[]) : null;
      const measuredIssues = Array.isArray(r.measured_issues) ? (r.measured_issues as AuditIssue[]) : null;
      const issuesResolved =
        baselineIssues != null && measuredIssues != null
          ? diffOutcomes(
              { seo: baselineSeo, geo: baselineGeo, issues: baselineIssues },
              { seo: measuredSeo, geo: measuredGeo, issues: measuredIssues },
            ).issuesResolved
          : 0;
      out.push({
        id: r.id as string,
        draftId,
        url: r.url as string,
        kind: r.kind as string,
        publishedAt: r.published_at as string,
        title: d?.title ?? null,
        baseline: { seo: baselineSeo, geo: baselineGeo },
        measured: { seo: measuredSeo, geo: measuredGeo, measuredAt: (r.measured_at as string | null) ?? null },
        gsc: {
          clicks: (r.gsc_clicks as number | null) ?? null,
          impressions: (r.gsc_impressions as number | null) ?? null,
          ctr: (r.gsc_ctr as number | null) ?? null,
          position: (r.gsc_position as number | null) ?? null,
        },
        linkedinEngagement: r.linkedin_engagement ?? null,
        seoDelta: baselineSeo != null && measuredSeo != null ? measuredSeo - baselineSeo : null,
        geoDelta: baselineGeo != null && measuredGeo != null ? measuredGeo - baselineGeo : null,
        issuesResolved,
        critiqueStatus: d?.critiqueStatus ?? null,
      });
    }
  } catch {
    return out;
  }
  outcomesCache = out;
  return out;
}