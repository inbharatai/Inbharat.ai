/**
 * POST /api/orchestrate — Agentic orchestration entry point with SSE streaming.
 *
 * This is the server-side "brain" endpoint. It:
 *  1. Classifies intent via ConversationRouter (zero LLM cost).
 *  2. Searches the web server-side via Serper (no extra round-trip).
 *  3. Builds Perplexity-grade system prompts with numbered citations.
 *  4. Calls OpenAI server-side and streams the response via SSE.
 *  5. For multi-step workflows: orchestrates parallel execution.
 *
 * Request body:
 *   { query, mode?, language?, imageData?, sessionId?, previousMessages?, stream? }
 *
 * Non-streaming response: { ok, text, sources, followUps, widget?, routing, requestId }
 * Streaming response: SSE events — { event: "sources"|"chunk"|"followUps"|"done"|"error", data }
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { isVerifyErr, verifySupabaseUserOptional } from "./lib/verifySupabaseUser.js";
import { serverLLMStream } from "./lib/serverLLM.js";
import { routeQuery } from "../lib/orchestration/router.js";
import { buildContextWindow, estimateTokens } from "../lib/orchestration/memory.js";
import { AgentMode } from "../types.js";
import { composeResponse } from "../lib/orchestration/responseComposer.js";
import type { AgentOutput, WorkflowStep, WorkflowStepDraft } from "../lib/orchestration/types.js";
import { getAgentForMode } from "../services/agents/registry.js";
import { dispatchTool } from "../lib/orchestration/toolRouter.js";
import { createWorkflow, updateWorkflowStatus, completeWorkflow, failWorkflow, cleanStaleWorkflows } from "../lib/orchestration/stateManager.js";
import { extractFollowUps } from "../services/agents/baseAgent.js";
import type { ServerRunContext } from "../services/agents/baseAgent.js";

// ── Language details for system prompt ──
const langMap: Record<string, { name: string; native: string }> = {
  EN: { name: "English", native: "English" },
  HI: { name: "Hindi", native: "\u0939\u093f\u0928\u094d\u0926\u0940" },
  BN: { name: "Bengali", native: "\u09ac\u09be\u0982\u09b2\u09be" },
  TA: { name: "Tamil", native: "\u0ba4\u0bae\u0bbf\u0bb4\u0bcd" },
  TE: { name: "Telugu", native: "\u0c24\u0c46\u0c32\u0c41\u0c17\u0c41" },
  MR: { name: "Marathi", native: "\u092e\u0930\u093e\u0920\u0940" },
  GU: { name: "Gujarati", native: "\u0a97\u0ac1\u0a9c\u0ab0\u0abe\u0aa4\u0ac0" },
  KN: { name: "Kannada", native: "\u0c95\u0ca8\u0ccd\u0ca8\u0ca1" },
  ML: { name: "Malayalam", native: "\u0d2e\u0d32\u0d2f\u0d3e\u0d33\u0d02" },
  PA: { name: "Punjabi", native: "\u0a2a\u0a70\u0a1c\u0a3e\u0a2c\u0a40" },
  OR: { name: "Odia", native: "\u0b13\u0b21\u0b3c\u0b3f\u0b06" },
  UR: { name: "Urdu", native: "\u0627\u0631\u062f\u0648" },
  AS: { name: "Assamese", native: "\u0985\u09b8\u09ae\u09c0\u09af\u09bc\u09be" },
  SA: { name: "Sanskrit", native: "\u0938\u0902\u0938\u094d\u0915\u0943\u0924\u092e\u094d" },
};

const bodySchema = z.object({
  query: z.string().min(1).max(5000),
  mode: z.string().optional(),
  language: z.string().optional().default("EN"),
  // 5 MB base64 limit (~3.75 MB raw image) — prevents memory exhaustion
  imageData: z.string().max(5_242_880).optional(),
  sessionId: z.string().optional(),
  stream: z.boolean().optional(),
  previousMessages: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string().max(10_000),
  })).max(50).optional(),
});

function getRequestId(req: VercelRequest): string {
  const id = req.headers?.["x-vercel-id"] ?? req.headers?.["x-request-id"];
  if (typeof id === "string") return id;
  if (Array.isArray(id) && id[0]) return String(id[0]);
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `req_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

// ── Mode-specific instructions now live in each Agent class ──
// (getAgentForMode(mode).getSystemInstructions())

// ── Greeting detection ──
const GREETING_RE = /^(hi|hello|hey|namaste|namaskar|hola|greetings?|good\s+(morning|afternoon|evening)|hiya|howdy)\.?!?\s*$/i;

// ── Classify streaming / workflow errors into SSE-safe codes ──
function classifyStreamError(err: unknown): string {
  const e = err as { status?: number; message?: string; code?: string };
  const status = typeof e?.status === "number" ? e.status : undefined;
  if (status === 401) return "CONFIG_ERROR";     // bad/missing API key
  if (status === 429) return "RATE_LIMIT";        // OpenAI rate limit
  if (status === 402) return "CONFIG_ERROR";      // quota exceeded
  if (status === 503 || status === 502 || status === 500) return "UPSTREAM_OVERLOADED";
  if (typeof e?.message === "string") {
    const m = e.message.toLowerCase();
    if (/api.?key|incorrect api key|invalid api key|unauthorized/i.test(m)) return "CONFIG_ERROR";
    if (/exceeded.*quota|quota exceeded|insufficient_quota/i.test(m)) return "CONFIG_ERROR";
    if (/rate.?limit|too many requests/i.test(m)) return "RATE_LIMIT";
    if (/overload|capacity|heavy traffic|service unavailable|server had an error|internal server error/i.test(m)) return "UPSTREAM_OVERLOADED";
    if (/timeout|timed out|request timed|read timed/i.test(m)) return "UPSTREAM_OVERLOADED";
    if (/econnreset|econnrefused|enotfound|network|fetch failed|failed to fetch|connection reset|socket hang/i.test(m)) return "UPSTREAM_OVERLOADED";
  }
  // Node.js system error codes
  if (typeof (e as { code?: string })?.code === "string") {
    const c = (e as { code: string }).code;
    if (/ECONNRESET|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|EPIPE/.test(c)) return "UPSTREAM_OVERLOADED";
  }
  return "SERVER_ERROR";
}

// ── Search gating + query rewriting now live in each Agent class ──
// (agent.shouldSearch(), agent.rewriteSearchQuery())

// ── Simple in-memory rate limiter (per IP, 30 requests/minute) ──
const rateMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 60_000;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT) return false;
  entry.count++;
  return true;
}

function handleGreeting(lang: string): { text: string; followUps: string[] } {
  const isHindi = lang === "HI";
  const text = isHindi
    ? `**InBharat Ai \u092e\u0947\u0902 \u0906\u092a\u0915\u093e \u0938\u094d\u0935\u093e\u0917\u0924 \u0939\u0948**\n\n\u0928\u092e\u0938\u094d\u0924\u0947! \u092e\u0948\u0902 **InBharat Ai** (\u0926\u0947\u0936 \u0915\u093e AI) \u0939\u0942\u0901\u0964 \u092e\u0948\u0902 \u0906\u092a\u0915\u0940 \u0915\u093f\u0938\u0940 \u092d\u0940 \u0935\u093f\u0937\u092f \u092e\u0947\u0902 \u0938\u0939\u093e\u092f\u0924\u093e \u0915\u0930 \u0938\u0915\u0924\u093e \u0939\u0942\u0901\u0964`
    : `**Welcome to InBharat Ai**\n\nNamaste! I am **InBharat Ai** (Desh Ka AI), your AI assistant. I can help you with research, analysis, coding, education, and much more.\n\nHow can I assist you today?`;
  const followUps = isHindi
    ? ["\u092d\u093e\u0930\u0924 \u0915\u0940 \u0935\u0930\u094d\u0924\u092e\u093e\u0928 \u0906\u0930\u094d\u0925\u093f\u0915 \u0938\u094d\u0925\u093f\u0924\u093f \u0915\u094d\u092f\u093e \u0939\u0948?", "\u0935\u093f\u0915\u0938\u093f\u0924 \u092d\u093e\u0930\u0924 2047 \u0915\u093e \u0935\u093f\u091c\u0928 \u0915\u094d\u092f\u093e \u0939\u0948?", "\u091a\u0902\u0926\u094d\u0930\u092f\u093e\u0928 \u092e\u093f\u0936\u0928 \u0915\u0940 \u0909\u092a\u0932\u092c\u094d\u0927\u093f\u092f\u093e\u0901 \u0915\u094d\u092f\u093e \u0939\u0948\u0902?"]
    : ["What are India's current economic growth projections?", "Explain the Viksit Bharat @2047 vision", "How is India's space programme evolving?"];
  return { text, followUps };
}

// ── Stale workflow cleanup (throttled: max once per 5 minutes per instance) ──
let _lastCleanup = 0;
const CLEANUP_INTERVAL_MS = 5 * 60_000;
async function maybeCleanStaleWorkflows() {
  const now = Date.now();
  if (now - _lastCleanup < CLEANUP_INTERVAL_MS) return;
  _lastCleanup = now;
  try {
    const cleaned = await cleanStaleWorkflows();
    if (cleaned > 0) console.log(`[orchestrate] cleaned ${cleaned} stale workflows`);
  } catch { /* best-effort */ }
}

// ── Connector function detection for UniAssist / TestPrep ──

function detectConnectorFunction(connector: "uniassist" | "testprep", query: string): string {
  if (connector === "uniassist") {
    if (/\b(pr\s+|permanent\s+residen|immigration|pr\s+score|pr\s+points|pr\s+chance)\b/i.test(query)) return "pr-predictor";
    if (/\b(scholarship|financial\s+aid|funding|grant)\b/i.test(query)) return "scholarship-search";
    if (/\b(profile\s+review|sop|lor|evaluate\s+my|review\s+my)\b/i.test(query)) return "profile-review";
    return "university-search";
  }
  // testprep
  if (/\b(study\s+plan|schedule|timetable|weekly\s+plan|planner)\b/i.test(query)) return "study-plan-generator";
  if (/\b(practice|mock|question|quiz|problem|exercise)\b/i.test(query)) return "practice-generator";
  if (/\b(performance|analysis|progress|score\s+analysis|improvement|weak\s+area)\b/i.test(query)) return "performance-analysis";
  return "exam-selector";
}

// ── Server-side step executor for multi-step workflows ──

const STEP_TIMEOUT_MS = 30_000; // 30s per step

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Step timed out after ${ms}ms: ${label}`)), ms);
    promise.then(
      (val) => { clearTimeout(timer); resolve(val); },
      (err) => { clearTimeout(timer); reject(err); },
    );
  });
}

async function executeServerSideStep(
  query: string,
  mode: AgentMode,
  lang: { name: string; native: string },
  requestId: string,
  previousOutputs: AgentOutput[],
  conversationContext?: Array<{ role: "user" | "assistant"; content: string }>,
  connectorName?: "uniassist" | "testprep",
  languageCode?: string,
  imageData?: string,
): Promise<AgentOutput> {
  // If this step targets a connector, call it first and inject result as context
  if (connectorName) {
    const fnName = detectConnectorFunction(connectorName, query);
    const connResult = await dispatchTool(
      { tool: "app_connector", args: { connector: connectorName, functionName: fnName, fnArgs: { query } } },
      { requestId },
    );
    if (connResult.ok && connResult.data) {
      const connData = connResult.data as Record<string, unknown>;
      const isStub = connData._stub === true;
      const summary = isStub
        ? `[${connectorName} is not yet configured — showing placeholder data. Connect the ${connectorName} API for live results.]`
        : `${connectorName} data: ${JSON.stringify(connData)}`;
      previousOutputs = [...previousOutputs, { text: summary, sources: [], followUps: [] }];
    }
  }

  const agent = getAgentForMode(mode);
  const recencyRe = /\b(current|latest|today|recent|now|this week|this month|breaking|live|update|newest|2025|2026)\b/i;
  const ctx: ServerRunContext = {
    requestId,
    mode,
    language: languageCode ?? "EN",
    langInfo: lang,
    previousOutputs,
    previousMessages: conversationContext,
    hasImage: !!imageData,
    imageData: imageData ?? undefined,
    wantsLive: recencyRe.test(query),
    dispatchTool,
  };
  return agent.runServer(query, ctx);
}

function stepAgentToMode(agent: WorkflowStepDraft["agent"]): AgentMode {
  if (agent === "uniassist" || agent === "testprep") return AgentMode.STANDARD;
  return agent as AgentMode;
}

function getStepLabel(agent: WorkflowStepDraft["agent"]): string {
  const labels: Record<string, string> = {
    RESEARCH: "Researching", CODER: "Writing code", EDUCATOR: "Explaining",
    BROWSER: "Browsing web", SHOPPER: "Finding products", EXECUTIVE: "Planning",
    STANDARD: "Analyzing", uniassist: "UniAssist lookup", testprep: "TestPrep lookup",
  };
  return (typeof agent === "string" && labels[agent]) || "Processing";
}

const MAX_WORKFLOW_STEPS = 5;

async function executeWorkflowSteps(
  drafts: WorkflowStepDraft[],
  lang: { name: string; native: string },
  requestId: string,
  conversationContext?: Array<{ role: "user" | "assistant"; content: string }>,
  onStatus?: (msg: string) => void,
  languageCode?: string,
  imageData?: string,
  onStepSources?: (sources: Array<{ title: string; uri: string }>) => void,
): Promise<WorkflowStep[]> {
  const capped = drafts.slice(0, MAX_WORKFLOW_STEPS);
  const steps: WorkflowStep[] = capped.map((d, i) => ({
    ...d,
    id: i,
    status: "pending" as const,
  }));
  const completed = new Set<number>();

  while (completed.size < steps.length) {
    const ready = steps.filter(
      s => s.status === "pending" && s.dependsOn.every(dep => completed.has(dep)),
    );

    if (ready.length === 0) {
      for (const s of steps) {
        if (s.status === "pending") {
          s.status = "failed";
          s.errorMessage = "Unresolvable dependency";
        }
      }
      break;
    }

    const promises = ready.map(async (step) => {
      step.status = "running";
      step.startedAt = new Date().toISOString();
      const mode = stepAgentToMode(step.agent);
      const connector = (step.agent === "uniassist" || step.agent === "testprep") ? step.agent : undefined;
      onStatus?.(`Step ${step.id + 1}/${steps.length}: ${getStepLabel(step.agent)}...`);

      try {
        const previousOutputs = step.dependsOn
          .map(dep => steps[dep]?.output)
          .filter((o): o is AgentOutput => !!o);

        const result = await withTimeout(
          executeServerSideStep(step.input, mode, lang, requestId, previousOutputs, conversationContext, connector, languageCode, imageData),
          STEP_TIMEOUT_MS,
          getStepLabel(step.agent),
        );

        step.output = result;
        step.status = "completed";
        step.completedAt = new Date().toISOString();

        // Stream this step's sources immediately
        if (result.sources.length > 0) {
          onStepSources?.(result.sources);
        }
      } catch (err: unknown) {
        step.status = "failed";
        step.completedAt = new Date().toISOString();
        step.errorMessage = err instanceof Error ? err.message : "Step execution failed";
      }
    });

    await Promise.all(promises);
    for (const step of ready) {
      completed.add(step.id);
    }
  }

  return steps;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const requestId = getRequestId(req);

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, code: "SERVER_ERROR", requestId });
  }

  // Best-effort stale workflow cleanup (throttled)
  maybeCleanStaleWorkflows();

  // Rate limiting
  const clientIp = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || "unknown";
  if (!checkRateLimit(clientIp)) {
    return res.status(429).json({ ok: false, code: "RATE_LIMIT", requestId });
  }

  // Auth (optional — guests allowed)
  const verified = await verifySupabaseUserOptional(req);
  if (isVerifyErr(verified)) {
    return res.status(verified.status).json({ ...verified.body, requestId });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ ok: false, code: "CONFIG_ERROR", requestId });
  }

  let parsed: z.infer<typeof bodySchema>;
  try {
    const raw = typeof req.body === "string" ? JSON.parse(req.body) : req.body ?? {};
    parsed = bodySchema.parse(raw);
  } catch {
    return res.status(400).json({ ok: false, code: "SERVER_ERROR", requestId });
  }

  const { query, language, imageData } = parsed;
  const previousMessages = (parsed.previousMessages ?? []) as Array<{ role: "user" | "assistant"; content: string }>;
  const shouldStream = parsed.stream === true;
  const lang = langMap[language!] ?? langMap.EN;

  // ── 1. Greeting short-circuit ──
  const trimmed = query.trim();
  if (trimmed.length <= 50 && GREETING_RE.test(trimmed.replace(/\s+/g, " "))) {
    const greeting = handleGreeting(language!);
    if (shouldStream) {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.write(`data: ${JSON.stringify({ event: "routing", routing: { intent: "general", mode: "STANDARD" } })}\n\n`);
      const CHUNK_SIZE = 80;
      for (let i = 0; i < greeting.text.length; i += CHUNK_SIZE) {
        res.write(`data: ${JSON.stringify({ event: "chunk", chunk: greeting.text.slice(i, i + CHUNK_SIZE) })}\n\n`);
      }
      res.write(`data: ${JSON.stringify({ event: "followUps", followUps: greeting.followUps })}\n\n`);
      res.write(`data: ${JSON.stringify({ event: "done", requestId, text: greeting.text })}\n\n`);
      res.end();
      return;
    }
    return res.status(200).json({
      ok: true,
      text: greeting.text,
      sources: [],
      followUps: greeting.followUps,
      routing: { intent: "general", isWorkflow: false },
      requestId,
    });
  }

  // ── 2. Route intent (zero LLM cost) ──
  const explicitMode = parsed.mode && Object.values(AgentMode).includes(parsed.mode as AgentMode)
    ? parsed.mode as AgentMode : undefined;
  const routing = routeQuery(query, explicitMode);
  const mode = (() => {
    const step = routing.suggestedSteps[0];
    if (step && typeof step.agent === "string" && Object.values(AgentMode).includes(step.agent as AgentMode))
      return step.agent as AgentMode;
    return AgentMode.STANDARD;
  })();

  try {
    // ── Multi-step workflow execution ──
    if (routing.isWorkflow && routing.suggestedSteps.length > 1) {
      // Persist workflow state
      const workflow = await createWorkflow({
        userId: null,
        sessionId: parsed.sessionId ?? requestId,
        workflowType: "multi_step",
        intentDetected: routing.intent,
        appTarget: routing.appTarget,
        steps: routing.suggestedSteps.map((d, i) => ({ ...d, id: i, status: "pending" as const })),
      });
      await updateWorkflowStatus(workflow.id, "running");

      if (shouldStream) {
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");

        res.write(`data: ${JSON.stringify({ event: "routing", routing: { intent: routing.intent, mode, isWorkflow: true, steps: routing.suggestedSteps.length } })}\n\n`);
        res.write(`data: ${JSON.stringify({ event: "status", status: "Planning multi-step workflow..." })}\n\n`);

        try {
          const workflowSteps = await executeWorkflowSteps(
            routing.suggestedSteps, lang, requestId,
            previousMessages.length > 0 ? previousMessages : undefined,
            (status) => res.write(`data: ${JSON.stringify({ event: "status", status })}\n\n`),
            language ?? "EN",
            imageData ?? undefined,
            (stepSources) => res.write(`data: ${JSON.stringify({ event: "sources", sources: stepSources })}\n\n`),
          );

          const composed = composeResponse({ steps: workflowSteps, language: language ?? "EN", verbose: true });

          res.write(`data: ${JSON.stringify({ event: "status", status: "Composing final response..." })}\n\n`);
          const composedText = composed.text;
          const CHUNK_SIZE = 80;
          for (let i = 0; i < composedText.length; i += CHUNK_SIZE) {
            res.write(`data: ${JSON.stringify({ event: "chunk", chunk: composedText.slice(i, i + CHUNK_SIZE) })}\n\n`);
          }

          res.write(`data: ${JSON.stringify({ event: "followUps", followUps: composed.followUps })}\n\n`);
          res.write(`data: ${JSON.stringify({ event: "done", requestId, text: composedText })}\n\n`);
          res.end();
          await completeWorkflow(workflow.id, workflowSteps);
        } catch (workflowErr: unknown) {
          const errCode = classifyStreamError(workflowErr);
          console.error(`[orchestrate] workflow error (${errCode}):`, workflowErr instanceof Error ? workflowErr.message : workflowErr);
          res.write(`data: ${JSON.stringify({ event: "error", code: errCode })}\n\n`);
          res.end();
          await failWorkflow(workflow.id);
        }
        return;
      }

      // Non-streaming multi-step
      const workflowSteps = await executeWorkflowSteps(
        routing.suggestedSteps, lang, requestId,
        previousMessages.length > 0 ? previousMessages : undefined,
        undefined, language ?? "EN", imageData ?? undefined,
      );
      const composed = composeResponse({ steps: workflowSteps, language: language ?? "EN", verbose: true });
      await completeWorkflow(workflow.id, workflowSteps);
      return res.status(200).json({
        ok: true,
        text: composed.text,
        sources: composed.sources,
        followUps: composed.followUps,
        routing: { intent: routing.intent, mode, isWorkflow: true, steps: routing.suggestedSteps.length },
        requestId,
      });
    }

    // ── 3. Single-step: delegate to agent ──
    const agent = getAgentForMode(mode);
    const recencyRe = /\b(current|latest|today|recent|now|this week|this month|breaking|live|update|newest|2025|2026|right now|as of today|recently|just announced)\b/i;
    const agentCtx: ServerRunContext = {
      requestId,
      mode,
      language: language ?? "EN",
      langInfo: lang,
      previousMessages,
      hasImage: !!imageData,
      imageData: imageData ?? undefined,
      wantsLive: recencyRe.test(query),
      dispatchTool,
    };

    // ── 4. Streaming response via SSE ──
    if (shouldStream) {
      // Set SSE headers FIRST — before any async work that could throw.
      // Once these are sent the outer catch MUST NOT call res.status().json().
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      // Send routing IMMEDIATELY so the client knows the connection is alive.
      res.write(`data: ${JSON.stringify({ event: "routing", routing: { intent: routing.intent, mode } })}\n\n`);
      res.write(`data: ${JSON.stringify({ event: "status", status: "Searching..." })}\n\n`);

      // Helper: send an SSE error event and close the stream.
      const sendSSEError = (code: string, err?: unknown) => {
        console.error(`[orchestrate] sse error (${code}):`, err instanceof Error ? err.message : err);
        try {
          res.write(`data: ${JSON.stringify({ event: "error", code })}\n\n`);
          res.end();
        } catch { /* response already closed */ }
      };

      // Prepare context (search, system-prompt build).
      let prepared: Awaited<ReturnType<typeof agent.prepareServerContext>>;
      try {
        prepared = await agent.prepareServerContext(query, agentCtx);
      } catch (prepErr: unknown) {
        sendSSEError(classifyStreamError(prepErr), prepErr);
        return;
      }

      // Send sources (Perplexity-style: sources appear before text)
      if (prepared.sources.length > 0) {
        res.write(`data: ${JSON.stringify({ event: "sources", sources: prepared.sources })}\n\n`);
      }
      res.write(`data: ${JSON.stringify({ event: "status", status: "Writing response..." })}\n\n`);

      // Build context window + messages (handles image data)
      const userTokens = estimateTokens(query) + (imageData ? 300 : 0);
      const contextWindow = buildContextWindow(previousMessages, 4000, estimateTokens(prepared.systemPrompt), userTokens);
      const systemWithContext = contextWindow.contextSummary
        ? prepared.systemPrompt + "\n\n" + contextWindow.contextSummary
        : prepared.systemPrompt;

      const messages: Array<{ role: string; content: unknown }> = [
        { role: "system", content: systemWithContext },
        ...contextWindow.messages,
        {
          role: "user",
          content: imageData
            ? [
                { type: "text", text: query },
                { type: "image_url", image_url: { url: imageData } },
              ]
            : query,
        },
      ];

      try {
        let fullText = "";
        for await (const chunk of serverLLMStream({ messages, mode, requestId })) {
          fullText += chunk;
          res.write(`data: ${JSON.stringify({ event: "chunk", chunk })}\n\n`);
        }

        const { mainText, followUps } = extractFollowUps(fullText);
        res.write(`data: ${JSON.stringify({ event: "followUps", followUps })}\n\n`);
        res.write(`data: ${JSON.stringify({ event: "done", requestId, text: mainText })}\n\n`);
        res.end();
      } catch (streamErr: unknown) {
        sendSSEError(classifyStreamError(streamErr), streamErr);
      }
      return;
    }

    // ── 5. Non-streaming: full agent delegation ──
    const result = await agent.runServer(query, agentCtx);

    return res.status(200).json({
      ok: true,
      text: result.text,
      sources: result.sources,
      followUps: result.followUps,
      routing: { intent: routing.intent, mode, isWorkflow: routing.isWorkflow },
      requestId,
    });
  } catch (err: unknown) {
    console.error("[orchestrate] error:", err instanceof Error ? err.message : err);
    return res.status(500).json({ ok: false, code: "SERVER_ERROR", requestId });
  }
}
