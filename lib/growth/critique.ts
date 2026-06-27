/**
 * InBharat Growth Agent — Module: Self-critique + revision pass.
 *
 * Every model-generated draft survives only after a second-pass 'review' model
 * critiques it against the founder voice + rules + the candidate's own
 * weaknesses, then revises. The revised body is what gets persisted to
 * growth_drafts; the critique (candidate, revised, weaknesses) is logged to
 * growth_critique_log for transparency.
 *
 * Reuses the Growth Agent's own model-router — pickModel('review') (Gemini
 * gemini-2.5-flash), withinBudget, logUsage, estimateCost — never the chat
 * backend. Redaction runs LAST, immediately before the model call (project
 * rule), re-redacting the combined prompt defensively even though the draft
 * pass already redacted the candidate.
 *
 * Graceful: when the review model isn't configured or the budget is exhausted,
 * the candidate is kept unchanged (status 'skipped') — the pipeline must never
 * break because critique is unavailable. Never throws.
 *
 * Server-only. Never touches the chat backend.
 */
import { redact } from "./redaction.js";
import { pickModel, isModelConfigured, withinBudget, logUsage, estimateCost, type GrowthTask } from "./model-router.js";
import { callGemini } from "./gemini.js";
import type { CritiqueInput, CritiqueResult, CritiqueWeakness } from "./types.js";

/**
 * Critique + revise a candidate draft body. Returns the revised body (or null
 * to keep the candidate) plus the weaknesses found + a status for logging/UI.
 */
export async function critiqueAndRevise(input: CritiqueInput): Promise<CritiqueResult> {
  const task: GrowthTask = "review";
  const choice = pickModel(task);
  const keep = (note: string, status: CritiqueResult["status"]): CritiqueResult => ({
    revised: null,
    weaknesses: [],
    note,
    status,
    model: choice.model,
    provider: choice.provider,
    costUsd: 0,
  });

  if (!isModelConfigured(choice) || !(await withinBudget())) {
    return keep("review model not configured or monthly budget exhausted", "skipped");
  }

  const system =
    "You are a critical reviewer for InBharat AI LinkedIn drafts. Compare the candidate to the founder's voice and the founder-authored rules. " +
    "Fix hype, jargon, off-brand positioning, weak hooks, and missing CTAs; keep it 60–90 words. " +
    "Respond ONLY with compact JSON: {\"revised\": string, \"weaknesses\": [{\"severity\":\"critical|major|minor\",\"area\": string,\"fix\": string}]}." +
    (input.rulesBlock ? `\n\n${input.rulesBlock}` : "");

  const ctxBits = [
    input.context.url ? `Article URL: ${input.context.url}` : null,
    input.context.title ? `Article title: ${input.context.title}` : null,
    input.context.sourceName && !input.context.url ? `Source: ${input.context.sourceName}` : null,
    `Draft kind: ${input.context.kind}`,
  ].filter(Boolean);
  const user =
    `Candidate draft:\n"""\n${input.draftBody}\n"""\n\n${ctxBits.join("\n")}\n\n` +
    `Return the revised draft in "revised" and a short list of weaknesses you fixed. JSON only.`;

  // Redact LAST before the model call (project rule). The candidate was already
  // redacted on the draft pass, but re-redact the combined payload defensively.
  const redacted = redact(`${system}\n\n${user}`);
  if (redacted.containedSecret) {
    return keep("redacted secret in critique prompt; aborted model call", "redacted");
  }

  let raw: string;
  try {
    raw = await callGemini(choice, system, user, { temperature: 0.4, maxOutputTokens: 700 });
  } catch (e) {
    void logUsage({
      model: choice.model,
      task,
      promptTokens: Math.ceil((system.length + user.length) / 4),
      completionTokens: 0,
      totalTokens: Math.ceil((system.length + user.length) / 4),
      costUsd: 0,
      status: "model_error",
      contextUrl: input.context.url ?? input.context.sourceName ?? null,
      provider: choice.provider,
    });
    return keep(`review model call failed: ${(e as Error).message}`, "model_error");
  }

  const parsed = safeParseCritique(raw);
  const totalTokens = Math.ceil((system.length + user.length + (raw?.length ?? 0)) / 4);
  const costUsd = estimateCost(choice, totalTokens);

  if (!parsed) {
    void logUsage({
      model: choice.model, task,
      promptTokens: Math.ceil((system.length + user.length) / 4),
      completionTokens: Math.ceil((raw?.length ?? 0) / 4),
      totalTokens, costUsd, status: "parse_failed",
      contextUrl: input.context.url ?? input.context.sourceName ?? null, provider: choice.provider,
    });
    return { ...keep("review model returned no usable revision; kept candidate", "parse_failed"), costUsd };
  }

  const revised = typeof parsed.revised === "string" && parsed.revised.trim() ? parsed.revised.trim() : null;
  const weaknesses = Array.isArray(parsed.weaknesses) ? parsed.weaknesses.map(coerceWeakness).filter(Boolean) as CritiqueWeakness[] : [];

  void logUsage({
    model: choice.model, task,
    promptTokens: Math.ceil((system.length + user.length) / 4),
    completionTokens: Math.ceil((raw?.length ?? 0) / 4),
    totalTokens, costUsd, status: revised ? "ok" : "parse_failed",
    contextUrl: input.context.url ?? input.context.sourceName ?? null, provider: choice.provider,
  });

  // Keep the candidate if the model returned no revision (or it's identical).
  const finalRevised = revised && revised !== input.draftBody ? revised : null;
  return {
    revised: finalRevised,
    weaknesses,
    note: finalRevised ? "revised" : "review kept candidate unchanged",
    status: "ok",
    model: choice.model,
    provider: choice.provider,
    costUsd,
  };
}

function safeParseCritique(raw: string): { revised?: unknown; weaknesses?: unknown } | null {
  try {
    return JSON.parse(raw) as { revised?: unknown; weaknesses?: unknown };
  } catch {
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      return JSON.parse(m[0]) as { revised?: unknown; weaknesses?: unknown };
    } catch {
      return null;
    }
  }
}

function coerceWeakness(w: unknown): CritiqueWeakness | null {
  if (!w || typeof w !== "object") return null;
  const o = w as Record<string, unknown>;
  const severity = o.severity;
  const area = typeof o.area === "string" ? o.area : "";
  const fix = typeof o.fix === "string" ? o.fix : "";
  if (!area && !fix) return null;
  const sev: CritiqueWeakness["severity"] =
    severity === "critical" || severity === "major" || severity === "minor" ? severity : "minor";
  return { severity: sev, area, fix };
}