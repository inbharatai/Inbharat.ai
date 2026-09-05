import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { getRequestId, isAdminErr, requireAdmin } from "../lib/requireAdmin.js";
import { supabaseAdmin } from "../lib/supabaseAdmin.js";
import {
  insertKnowledge,
  listKnowledge,
  searchKnowledge,
  markUsed,
  markOutdated,
  archive,
  setStatus,
  linkToArticle,
  linkToPost,
  recordDecision,
  deleteKnowledge,
  type KnowledgeType,
  type KnowledgeStatus,
} from "../../lib/growth/knowledge.js";

/**
 * /api/growth/knowledge — the inbox-as-knowledge-base CRUD. Admin-only.
 *   GET    ?query=...&product=...&type=...&status=...&limit=...  → search/list
 *   POST   { type, title, summary?, body?, sourceUrl?, ... }     → insert (dedupes by hash)
 *   PATCH  { id, action }   action: markUsed|markOutdated|archive|approve|reject|skip|linkArticle|linkPost
 *   DELETE { id }
 *
 * The Knowledge page renders this; the agent tools (save_knowledge / search_knowledge
 * / list_knowledge / find_duplicate) call lib/growth/knowledge.ts directly. Never
 * throws; degrades to empty / 503 when Supabase is absent.
 */
const TYPES: KnowledgeType[] = ["source", "topic", "article", "post", "draft", "note", "competitor_gap", "keyword", "performance", "decision"];
const STATUSES: KnowledgeStatus[] = ["discovered", "needs_review", "approved", "drafted", "published", "skipped", "update_existing", "outdated", "archived"];

const PostBody = z.object({
  type: z.enum(TYPES as [KnowledgeType, ...KnowledgeType[]]),
  title: z.string().min(1).max(500),
  summary: z.string().max(2000).nullish(),
  body: z.string().max(50000).nullish(),
  // sourceUrl must be an http(s) URL — a `javascript:` scheme would execute
  // in the Knowledge UI's <a href={it.sourceUrl}> on click. The agent's Gemini
  // grounding chunks are always https, so this only gates the founder-paste path,
  // but it's a real XSS vector against the admin UI otherwise.
  sourceUrl: z.string().max(1000).refine((v) => !v || /^https?:\/\/.+/i.test(v), "sourceUrl must be an http(s) URL").nullish(),
  sourceType: z.string().max(120).nullish(),
  relatedProduct: z.string().max(120).nullish(),
  topicCluster: z.string().max(120).nullish(),
  keywords: z.array(z.string().max(80)).max(12).optional(),
  intentScore: z.number().int().min(0).max(100).nullish(),
  freshnessScore: z.number().int().min(0).max(100).nullish(),
  authorityScore: z.number().int().min(0).max(100).nullish(),
  riskLevel: z.enum(["low", "medium", "high"]).optional(),
  status: z.enum(STATUSES as [KnowledgeStatus, ...KnowledgeStatus[]]).optional(),
  linkedArticleId: z.string().max(200).nullish(),
  linkedPostId: z.string().max(200).nullish(),
});

const PatchBody = z.object({
  id: z.string().min(1),
  action: z.enum([
    "markUsed", "markOutdated", "archive", "approve", "reject", "skip",
    "linkArticle", "linkPost", "setStatus",
  ]),
  status: z.enum(STATUSES as [KnowledgeStatus, ...KnowledgeStatus[]]).optional(),
  slug: z.string().max(200).optional(),
  postId: z.string().max(200).optional(),
});

const DeleteBody = z.object({ id: z.string().min(1) });

async function audit(userId: string, action: string, detail: string): Promise<void> {
  if (!supabaseAdmin) return;
  await supabaseAdmin
    .from("growth_agent_logs")
    .insert({ level: "info", action, scope: userId, detail })
    .then(() => undefined, () => undefined);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const requestId = getRequestId(req);
  const admin = await requireAdmin(req);
  if (isAdminErr(admin)) return res.status(admin.status).json(admin.body);

  if (req.method === "GET") {
    const { query, product, type, status, limit } = (req.query ?? {}) as Record<string, string | undefined>;
    const opts = {
      product: product || null,
      type: (type && (TYPES as string[]).includes(type) ? (type as KnowledgeType) : null),
      status: (status && (STATUSES as string[]).includes(status) ? (status as KnowledgeStatus) : null),
      limit: limit ? Math.max(1, Math.min(Number(limit) || 100, 400)) : 100,
    };
    const items = query ? await searchKnowledge(query, opts) : await listKnowledge(opts);
    return res.status(200).json({ ok: true, requestId, items });
  }

  if (!supabaseAdmin) {
    return res.status(503).json({ ok: false, code: "SERVER_ERROR", error: "Supabase not configured — knowledge base requires the DB.", requestId });
  }

  if (req.method === "POST") {
    const parsed = PostBody.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ ok: false, code: "SERVER_ERROR", error: "Invalid body", requestId });
    const item = await insertKnowledge({ ...parsed.data, type: parsed.data.type!, title: parsed.data.title! });
    if (!item) return res.status(500).json({ ok: false, code: "SERVER_ERROR", error: "DB insert failed (or duplicate hash)", requestId });
    await audit(admin.userId, "knowledge-create", `${item.type}:${item.title.slice(0, 80)}`);
    return res.status(201).json({ ok: true, requestId, item });
  }

  if (req.method === "PATCH") {
    const parsed = PatchBody.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ ok: false, code: "SERVER_ERROR", error: "Invalid body", requestId });
    const { id, action } = parsed.data;
    let ok = false;
    switch (action) {
      case "markUsed": ok = await markUsed(id); break;
      case "markOutdated": ok = await markOutdated(id); break;
      case "archive": ok = await archive(id); break;
      case "approve": ok = await recordDecision(id, true); break;
      case "reject": ok = await recordDecision(id, false); break;
      case "skip": ok = await setStatus(id, "skipped"); break;
      case "linkArticle": ok = parsed.data.slug ? await linkToArticle(id, parsed.data.slug) : false; break;
      case "linkPost": ok = parsed.data.postId ? await linkToPost(id, parsed.data.postId) : false; break;
      case "setStatus": ok = parsed.data.status ? await setStatus(id, parsed.data.status) : false; break;
    }
    if (!ok) return res.status(500).json({ ok: false, code: "SERVER_ERROR", error: "DB update failed", requestId });
    await audit(admin.userId, "knowledge-update", `${id}:${action}`);
    return res.status(200).json({ ok: true, requestId });
  }

  if (req.method === "DELETE") {
    const parsed = DeleteBody.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ ok: false, code: "SERVER_ERROR", error: "Invalid body", requestId });
    const ok = await deleteKnowledge(parsed.data.id);
    if (!ok) return res.status(500).json({ ok: false, code: "SERVER_ERROR", error: "DB delete failed", requestId });
    await audit(admin.userId, "knowledge-delete", parsed.data.id);
    return res.status(200).json({ ok: true, requestId });
  }

  res.setHeader("Allow", "GET, POST, PATCH, DELETE");
  return res.status(405).json({ ok: false, code: "SERVER_ERROR", error: "Method not allowed", requestId });
}