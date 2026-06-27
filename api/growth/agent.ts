import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { getRequestId, isAdminErr, requireAdmin } from "../lib/requireAdmin.js";
import { runAgentTurn, listThreads, loadThreadMessages } from "../../lib/growth/agent.js";

/**
 * /api/growth/agent — the conversational CMO agent surface (Phase C). Admin-only.
 *   GET                         → { threads: [...] }  recent conversation threads
 *   GET  ?threadId=<id>         → { thread, messages: [...] }  one thread's history
 *   POST { message, threadId?, attachmentItemIds? }
 *        → run one agent turn (bounded Gemini function-calling); returns the
 *          assistant reply + the full message trail. The agent never publishes —
 *          every tool it calls produces a human-gated draft in growth_drafts.
 *
 * Gemini-only; never touches the chat backend. Real enforcement is requireAdmin.
 */
const TurnBody = z.object({
  message: z.string().min(1).max(8000),
  threadId: z.string().uuid().optional(),
  attachmentItemIds: z.array(z.string().uuid()).max(10).optional(),
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const requestId = getRequestId(req);
  const admin = await requireAdmin(req);
  if (isAdminErr(admin)) return res.status(admin.status).json(admin.body);

  if (req.method === "GET") {
    const threadId = typeof req.query?.threadId === "string" ? req.query.threadId : null;
    if (threadId) {
      const messages = await loadThreadMessages(threadId);
      return res.status(200).json({ ok: true, requestId, threadId, messages });
    }
    const threads = await listThreads(30);
    return res.status(200).json({ ok: true, requestId, threads });
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ ok: false, code: "SERVER_ERROR", error: "Method not allowed", requestId });
  }

  const parsed = TurnBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ ok: false, code: "SERVER_ERROR", error: "Invalid body (need message ≤8000 chars).", requestId });

  const result = await runAgentTurn(parsed.data.message, parsed.data.threadId ?? null, parsed.data.attachmentItemIds ?? []);
  return res.status(result.ok ? 200 : 200).json({
    ok: result.ok,
    requestId,
    threadId: result.threadId,
    reply: result.reply,
    messages: result.messages,
    note: result.note,
  });
}