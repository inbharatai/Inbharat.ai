import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getRequestId, isAdminErr, requireAdmin } from "../lib/requireAdmin.js";
import { supabaseAdmin } from "../lib/supabaseAdmin.js";
import { runAccuracyGates, type GateInput } from "../../lib/growth/gates.js";

/**
 * POST /api/growth/gates — re-run the 8 advisory accuracy gates on a draft.
 *
 * Admin-only. Loads the draft by id, reconstructs a GateInput from the stored
 * row (kind/title/body_md + schema_json slug/description/abstract/critique),
 * and returns the per-gate verdict. Advisory — NEVER blocks approval (the
 * approvals endpoint is unchanged); the founder clicks Approve regardless.
 *
 * HONEST: grounding snippets are NOT persisted per-draft, so on a re-run gates
 * 2 (source-quality) + 3 (fact-check) skip-with-note — the original grounding
 * lived upstream at draft time. Gate 4 reuses the stored critique (NO new model
 * call). Gate 6 is a static markdown pre-check; the full crawl audit runs
 * post-publish. costUsd is always 0.
 *
 * Body: { draftId: string }  OR  { text: string, kind?: 'article'|'linkedin'|'video-script' }
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const requestId = getRequestId(req);
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, code: "SERVER_ERROR", error: "Method not allowed", requestId });
  }
  const admin = await requireAdmin(req);
  if (isAdminErr(admin)) return res.status(admin.status).json(admin.body);

  const body = (req.body ?? {}) as { draftId?: string; text?: string; kind?: string };
  const draftId = typeof body.draftId === "string" ? body.draftId.trim() : "";
  const text = typeof body.text === "string" ? body.text : "";

  if (!draftId && !text) {
    return res.status(400).json({ ok: false, code: "BAD_REQUEST", error: "Need draftId or text.", requestId });
  }

  if (draftId) {
    if (!supabaseAdmin) return res.status(503).json({ ok: false, code: "DB_UNCONFIGURED", error: "Database not configured.", requestId });
    const { data: row, error } = await supabaseAdmin
      .from("growth_drafts")
      .select("id,kind,url,title,body_md,schema_json")
      .eq("id", draftId)
      .maybeSingle();
    if (error || !row) return res.status(404).json({ ok: false, code: "NOT_FOUND", error: "Draft not found.", requestId });
    const r = row as { id: string; kind: string; url: string | null; title: string | null; body_md: string | null; schema_json: Record<string, unknown> | null };
    const sj = (r.schema_json ?? {}) as {
      slug?: string; description?: string; abstract?: string;
      critique?: { weaknesses?: { severity: string; area: string; fix: string }[]; status?: string; revised?: string | null } | null;
    };
    const kind = (r.kind === "linkedin" || r.kind === "video-script" ? r.kind : "article") as GateInput["kind"];
    const platform = kind === "linkedin" ? "linkedin" : "inbharat";
    const slug = typeof sj.slug === "string" ? sj.slug : (r.url ? (r.url.split("/learn-ai-with-reeturaj/")[1] ?? "").split(/[/?#]/)[0] : "");
    const input: GateInput = {
      kind,
      slug,
      title: r.title ?? "",
      description: typeof sj.description === "string" ? sj.description : undefined,
      abstract: typeof sj.abstract === "string" ? sj.abstract : undefined,
      bodyMd: r.body_md ?? "",
      platform,
      critique: sj.critique && Array.isArray(sj.critique.weaknesses) ? { weaknesses: sj.critique.weaknesses, status: sj.critique.status ?? "ok", revised: sj.critique.revised ?? null } : null,
      snippets: [],
    };
    const run = await runAccuracyGates(input);
    return res.status(200).json({ ok: true, requestId, draftId, overall: run.overall, summary: run.summary, gates: run.gates, costUsd: run.costUsd });
  }

  // Pasted-text path.
  const kind = (body.kind === "linkedin" || body.kind === "video-script" ? body.kind : "article") as GateInput["kind"];
  const platform = kind === "linkedin" ? "linkedin" : "inbharat";
  const input: GateInput = {
    kind,
    slug: "",
    title: text.split(/\n/)[0]?.slice(0, 120) || "Pasted text",
    bodyMd: text,
    platform,
    snippets: [],
  };
  const run = await runAccuracyGates(input);
  return res.status(200).json({ ok: true, requestId, overall: run.overall, summary: run.summary, gates: run.gates, costUsd: run.costUsd });
}