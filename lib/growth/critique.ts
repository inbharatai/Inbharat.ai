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
import { insertKnowledge } from "./knowledge.js";
import type { CritiqueInput, CritiqueResult, CritiqueWeakness } from "./types.js";

/** Trailing hashtag line: one-or-more `#Tag` tokens at the end of the text. */
const TRAILING_HASHTAGS = /#[\w-]+(?:\s+#[\w-]+)*\s*$/;

/**
 * Deterministic hashtag-preservation backstop. If the original draft ended with
 * a trailing hashtag line (`#ai #bharat #safety`) and the critique revision does
 * NOT end with hashtags, re-append the original line. If the revision already
 * ends with hashtags (the model kept or edited them), leave it. If the original
 * had no trailing hashtags, return the revised unchanged. Pure.
 */
export function preserveTrailingHashtags(original: string, revised: string): string {
  const m = original.match(TRAILING_HASHTAGS);
  if (!m) return revised; // original had no trailing hashtag line
  if (TRAILING_HASHTAGS.test(revised.trimEnd())) return revised; // revision kept some
  return `${revised.trimEnd()}\n${m[0].trim()}`;
}

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

  const isArticle = input.context.kind === "article";
  const system =
    (isArticle
      ? "You are a critical reviewer for an InBharat AI founder-authored article. Compare the candidate body to the founder's voice and the founder-authored rules. " +
        "Fix hype, jargon, off-brand positioning, weak hooks, and missing CTAs. PRESERVE the full article length and markdown structure (leading `> ` blockquote, `## ` section headings, prose, ```mermaid diagrams, ```code fences, trailing `---` / author line / `#hashtags`). " +
        "Keep any ```mermaid diagrams and code blocks well-formed and accurate (valid mermaid syntax that renders, real runnable code); fix broken syntax but do not invent new diagrams. Technical articles and development-plan content are normal — revise voice and hype only, never question or reframe the topic. " +
        (input.groundingBlock
          ? "FACT-CHECK (critical): flag any numeric, date, API-name, or version-string claim in the candidate that is NOT supported by the GROUNDING block below (or by well-established common knowledge). For each unsupported claim, add a `critical` weakness with area='fact-check' and a fix that either removes the claim, hedges it, or replaces it with a grounded statement. Do NOT invent a replacement fact; if you cannot ground it, cut it or hedge it honestly. "
          : "") +
        "NEVER ask clarifying questions, never apologize, never refuse — ALWAYS respond with the JSON object only; if you cannot improve the body, set the revised field to the candidate verbatim. Return the COMPLETE revised article body (same length range as the candidate). "
      : "You are a critical reviewer for InBharat AI LinkedIn drafts. Compare the candidate to the founder's voice and the founder-authored rules. " +
        "Fix hype, jargon, off-brand positioning, weak hooks, and missing CTAs; keep it 60–90 words. The caption is PLAIN TEXT for LinkedIn — STRIP any markdown formatting (**bold**, _italics_, ## headings, code) so it reads as clean plain sentences, BUT PRESERVE the trailing hashtag line (the space-separated #Tags at the end); LinkedIn renders markdown as literal characters, while hashtags are legitimate plain-text discoverability, not markdown. ") +
    "Respond ONLY with compact JSON: {\"revised\": string, \"weaknesses\": [{\"severity\":\"critical|major|minor\",\"area\": string,\"fix\": string}]}." +
    (input.strategyBlock ? `\n\n${input.strategyBlock}` : "") +
    (input.rulesBlock ? `\n\n${input.rulesBlock}` : "") +
    (input.inboxBlock ? `\n\n${input.inboxBlock}` : "") +
    (input.groundingBlock ? `\n\n${input.groundingBlock}` : "");

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
    raw = await callGemini(choice, system, user, { temperature: 0.4, maxOutputTokens: isArticle ? 8192 : 700 });
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
  // Deterministic hashtag-preservation backstop: the critique PROMPT asks the
  // model to preserve the trailing hashtag line, but a revision can silently drop
  // it — and the caption/article ships without discoverability tags with no
  // signal to the founder. Re-append the original trailing hashtag line when the
  // revised text ends with no hashtags. Structural guarantee, not model-dependent.
  const finalRevised = revised && revised !== input.draftBody ? preserveTrailingHashtags(input.draftBody, revised) : null;

  // Phase 2: best-effort KB write — capture critique weaknesses as a learning
  // note for this topic so future drafts avoid the same issues. content_hash
  // dedupes identical critiques; never throws (degrades to null on DB error).
  // Only writes when there are weaknesses (empty critiques don't spam the KB).
  if (weaknesses.length > 0) {
    void insertKnowledge({
      type: "note",
      title: input.context.title ?? input.context.url ?? "Critique note",
      summary: weaknesses.map((w) => `${w.severity}: ${w.area} — ${w.fix}`).join(" | "),
      sourceType: "user_note",
      keywords: weaknesses.map((w) => w.area).slice(0, 8),
      status: "approved",
    }).catch(() => null);
  }

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