/**
 * InBharat Growth Agent — Phase C5: Auto Mode (bounded autonomy loop).
 *
 * The founder flips Auto Mode on when they want the agent to work autonomously.
 * While ON, a cron loop drafts pending work (LinkedIn captions for articles that
 * don't have one yet + on-brand covers for visual-less articles) up to
 * `maxTasksPerRun`, budget-gated. Every artifact is a HUMAN-GATED draft in
 * growth_drafts — Auto Mode NEVER publishes.
 *
 * `autoApprove` (off by default, scary-labeled in the UI) additionally flips
 * pending drafts → approved (audited auto=true) so they're ready to ship. The
 * actual publish (cover → GitHub commit; LinkedIn → share deep-link) stays a
 * founder click — deliberately: auto-committing to the live site is high-risk and
 * LinkedIn has no API. "Autonomous work, human-gated publish" — honest scoping.
 *
 * Budget guardrail: every loop re-checks withinBudget(); when exhausted, the loop
 * no-ops + records it (so the founder sees why). Auto Mode never runs away on
 * spend. Gemini-only; never touches the chat backend. Server-only.
 */
import { supabaseAdmin } from "../../api/lib/supabaseAdmin.js";
import { withinBudget } from "./model-router.js";
import { promoteArticle } from "./promoter.js";
import { generateCoverDraft } from "./cover.js";
import { ARTICLES, articlePath } from "../../content/articles.meta.js";
import { SITE } from "../../seo.config.js";
import { logInfo } from "./authorization.js";

export interface AutoMode {
  enabled: boolean;
  autoApprove: boolean;
  cadenceMinutes: number;
  maxTasksPerRun: number;
  lastRunAt: string | null;
  lastRunSummary: string | null;
}

interface AutoModeRow {
  enabled: boolean;
  auto_approve: boolean;
  cadence_minutes: number;
  max_tasks_per_run: number;
  last_run_at: string | null;
  last_run_summary: string | null;
}

const DEFAULTS: AutoMode = {
  enabled: false,
  autoApprove: false,
  cadenceMinutes: 30,
  maxTasksPerRun: 5,
  lastRunAt: null,
  lastRunSummary: null,
};

/** In-process guard so overlapping cron invocations no-op instead of double-drafting. */
let autoLoopRunning = false;

function rowToMode(r: AutoModeRow): AutoMode {
  return {
    enabled: r.enabled,
    autoApprove: r.auto_approve,
    cadenceMinutes: r.cadence_minutes,
    maxTasksPerRun: r.max_tasks_per_run,
    lastRunAt: r.last_run_at,
    lastRunSummary: r.last_run_summary,
  };
}

/** Load the Auto Mode singleton. Returns DEFAULTS when the DB/table is absent
 *  (pre-migration) — i.e. Auto Mode is OFF until the founder turns it on. */
export async function loadAutoMode(): Promise<AutoMode> {
  if (!supabaseAdmin) return DEFAULTS;
  try {
    const { data, error } = await supabaseAdmin
      .from("growth_auto_mode")
      .select("enabled,auto_approve,cadence_minutes,max_tasks_per_run,last_run_at,last_run_summary")
      .eq("id", 1)
      .maybeSingle();
    if (error || !data) return DEFAULTS;
    return rowToMode(data as AutoModeRow);
  } catch {
    return DEFAULTS;
  }
}

/** Save the Auto Mode settings (admin toggle). Writes the singleton + audit log. */
export async function saveAutoMode(userId: string, patch: Partial<Pick<AutoMode, "enabled" | "autoApprove" | "cadenceMinutes" | "maxTasksPerRun">>): Promise<AutoMode> {
  if (!supabaseAdmin) return DEFAULTS;
  const row: Record<string, unknown> = { id: 1, updated_by: userId };
  if (patch.enabled !== undefined) row.enabled = patch.enabled;
  if (patch.autoApprove !== undefined) row.auto_approve = patch.autoApprove;
  if (patch.cadenceMinutes !== undefined) row.cadence_minutes = patch.cadenceMinutes;
  if (patch.maxTasksPerRun !== undefined) row.max_tasks_per_run = patch.maxTasksPerRun;
  const { error } = await supabaseAdmin.from("growth_auto_mode").upsert(row, { onConflict: "id" });
  if (error) throw new Error(`DB upsert failed: ${error.message}`);
  await supabaseAdmin
    .from("growth_agent_logs")
    .insert({ level: "info", action: "auto-mode-update", scope: userId, detail: JSON.stringify(patch) })
    .then(() => undefined, () => undefined);
  return loadAutoMode();
}

export interface AutoRunResult {
  ran: boolean;
  drafted: number;
  approved: number;
  skipped: number;
  reason?: string;
  summary: string;
}

/**
 * Run one Auto Mode work cycle (called from the cron loop or "Run now"). When
 * disabled or budget-exhausted, no-ops + records why. Otherwise drafts captions +
 * covers up to maxTasksPerRun, and (if autoApprove) flips pending drafts to
 * approved. Never publishes. Never throws.
 */
export async function runAutoLoop(): Promise<AutoRunResult> {
  const mode = await loadAutoMode();
  if (!mode.enabled) {
    return { ran: false, drafted: 0, approved: 0, skipped: 0, reason: "disabled", summary: "Auto Mode is off." };
  }
  // Concurrency guard: if a previous run is still in flight (cron fired again
  // before the last run finished — covers/image-gen can take well over the
  // cadence), no-op instead of overlapping. In-process flag (a single Vercel
  // instance is the common case for a 30-min cron); cross-instance overlap
  // would need a DB advisory lock, which PostgREST can't expose.
  if (autoLoopRunning) {
    return { ran: false, drafted: 0, approved: 0, skipped: 0, reason: "already-running", summary: "Auto Mode already running — skipped." };
  }
  if (!(await withinBudget())) {
    await recordRun("budget exhausted — Auto Mode paused (raise the cap in Settings)");
    return { ran: false, drafted: 0, approved: 0, skipped: 0, reason: "budget", summary: "Budget exhausted — Auto Mode paused." };
  }

  autoLoopRunning = true;
  // Capture the run start so auto-approve only blesses drafts created THIS run
  // (not stale pending drafts from days ago the founder forgot about).
  const runStart = new Date().toISOString();
  try {
    let drafted = 0;
    let skipped = 0;
    const cap = mode.maxTasksPerRun;

    // 1) Draft LinkedIn captions for articles that don't have one yet. Captions
    //    are cheap + fast, so they get the full cap.
    for (const meta of ARTICLES) {
      if (drafted + skipped >= cap) break;
      const url = SITE.url + articlePath(meta.slug);
      try {
        const r = await promoteArticle(url, { title: meta.title, description: meta.abstract });
        if (r.status === "pending") drafted++;
        else skipped++;
      } catch (e) {
        await logInfo("auto-promote-fail", url, (e as Error).message).catch(() => undefined);
        skipped++;
      }
    }

    // 2) Draft covers for visual-less articles. Covers get their OWN sub-cap
    //    (independent of the caption accumulator) so the caption loop can no
    //    longer starve them — the old shared accumulator let captions consume
    //    the whole cap and the cover loop's first check broke immediately.
    //    Bounded to a few per run (each is ~$0.04 + slow image gen).
    const coverCap = Math.max(1, Math.min(cap, 3));
    let coverDrafted = 0;
    let coverSkipped = 0;
    for (const meta of ARTICLES) {
      if (meta.visual) continue;
      if (coverDrafted + coverSkipped >= coverCap) break;
      try {
        const r = await generateCoverDraft(meta);
        if (r.status === "pending") coverDrafted++;
        else coverSkipped++;
      } catch (e) {
        await logInfo("auto-cover-fail", meta.slug, (e as Error).message).catch(() => undefined);
        coverSkipped++;
      }
    }
    drafted += coverDrafted;
    skipped += coverSkipped;

    // 3) Optional auto-approve: flip THIS run's pending linkedin/cover drafts →
    //    approved (audited auto=true). Publish stays a founder click.
    let approved = 0;
    if (mode.autoApprove) {
      approved = await autoApprovePending(runStart);
    }

    const summary = `Auto Mode run: drafted=${drafted} skipped=${skipped}${mode.autoApprove ? ` approved=${approved}` : ""}`;
    await recordRun(summary);
    await logInfo("auto-run", "global", summary).catch(() => undefined);
    return { ran: true, drafted, approved, skipped, summary };
  } finally {
    autoLoopRunning = false;
  }
}

/**
 * Flip THIS run's pending linkedin/cover drafts → approved + write a
 * growth_approvals row marked auto. Scoped to drafts created since `runStart`
 * AND to the kinds Auto Mode produces (linkedin, cover) — so a stale
 * article/video-script/inbox-outline draft from days ago is NEVER silently
 * auto-blessed. Capped at 10. Records exactly which drafts (id + kind) were
 * approved so the founder can audit. Never publishes.
 */
async function autoApprovePending(runStart: string): Promise<number> {
  if (!supabaseAdmin) return 0;
  try {
    const { data, error } = await supabaseAdmin
      .from("growth_drafts")
      .select("id,kind,url,title")
      .eq("status", "pending")
      .in("kind", ["linkedin", "cover"])
      .gte("created_at", runStart)
      .order("created_at", { ascending: true })
      .limit(10);
    if (error || !Array.isArray(data)) return 0;
    let count = 0;
    const approvedIds: string[] = [];
    const approvedKinds: string[] = [];
    for (const r of (data as Array<{ id: string; kind: string; url: string | null; title: string | null }>)) {
      // Insert the approval row FIRST (mirror approvals.ts ordering), then flip.
      const { error: insErr } = await supabaseAdmin.from("growth_approvals").insert({
        draft_id: r.id, reviewer: "auto", decision: "approved", note: "auto-approve (Auto Mode)",
      });
      if (insErr) continue;
      const { error: upErr } = await supabaseAdmin.from("growth_drafts").update({ status: "approved" }).eq("id", r.id);
      if (upErr) continue;
      count++;
      approvedIds.push(r.id);
      approvedKinds.push(r.kind);
    }
    if (count > 0) {
      await supabaseAdmin
        .from("growth_agent_logs")
        .insert({
          level: "info", action: "auto-approve", scope: "global",
          detail: `auto-approved ${count} draft(s): ${approvedIds.map((id, i) => `${approvedKinds[i]}:${id.slice(0, 8)}`).join(", ")}`,
        })
        .then(() => undefined, () => undefined);
    }
    return count;
  } catch {
    return 0;
  }
}

async function recordRun(summary: string): Promise<void> {
  if (!supabaseAdmin) return;
  await supabaseAdmin
    .from("growth_auto_mode")
    .update({ last_run_at: new Date().toISOString(), last_run_summary: summary })
    .eq("id", 1)
    .then(() => undefined, () => undefined);
}