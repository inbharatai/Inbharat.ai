/**
 * BaseAgent — abstract class every functional agent extends.
 *
 * Provides a uniform interface for:
 *  - Client-side execution via NexusAgent (run method)
 *  - Server-side execution via ToolRouter (runServer method)
 *
 * Each agent implements getSystemInstructions() and shouldSearch()
 * to define mode-specific behavior. The default runServer() uses
 * ToolRouter for search/LLM and handles prompt construction,
 * context windows, image data, and follow-up extraction.
 */

import type {
  AgentInput,
  AgentOutput,
  IntentCategory,
  ToolCall,
  ToolResult,
} from "../../lib/orchestration/types.js";
import {
  buildContextWindow,
  estimateTokens,
} from "../../lib/orchestration/memory.js";

/** Context for server-side agent execution. Injected by orchestrate.ts. */
export interface ServerRunContext {
  requestId: string;
  mode: string;
  language: string;
  langInfo: { name: string; native: string };
  /** Outputs from earlier workflow steps (multi-step context chaining). */
  previousOutputs?: AgentOutput[];
  /** Full conversation history for context window building. */
  previousMessages?: Array<{ role: "user" | "assistant"; content: string }>;
  hasImage: boolean;
  imageData?: string;
  wantsLive: boolean;
  /** Injected tool dispatcher — calls go through ToolRouter. */
  dispatchTool: (call: ToolCall, ctx: { requestId: string; mode?: string; language?: string }) => Promise<ToolResult>;
}

/** Pre-computed search results and system prompt (for streaming path). */
export interface PreparedContext {
  systemPrompt: string;
  sources: Array<{ title: string; uri: string }>;
}

/** Shared follow-up extraction — used by BaseAgent and orchestrate.ts streaming path. */
export function extractFollowUps(text: string): { mainText: string; followUps: string[] } {
  const followUps: string[] = [];
  const lines = text.split("\n");
  const mainLines = lines.filter(line => {
    const trimmed = line.trim();
    const match = trimmed.match(/^(?:[-*\d.)\s]*)?(?:\*{0,2})?\s*FOLLOW[\s_-]?UP:\s*(?:\*{0,2})?\s*(.+)/i);
    if (match) {
      followUps.push(match[1].trim());
      return false;
    }
    return true;
  });
  return { mainText: mainLines.join("\n").trim(), followUps: followUps.slice(0, 3) };
}

export abstract class BaseAgent {
  /** Human-readable agent name (e.g. "Researcher", "Coder"). */
  abstract readonly name: string;

  /** Client-side execution (wraps NexusAgent). */
  abstract run(input: AgentInput): Promise<AgentOutput>;

  /** Return true if this agent can handle the given intent category. */
  abstract canHandle(intent: IntentCategory): boolean;

  /** Mode-specific system prompt instructions. Override per agent. */
  abstract getSystemInstructions(): string;

  /** Whether this agent needs web search for a given query. Override per agent. */
  shouldSearch(_query: string): boolean {
    return true;
  }

  /**
   * Server-side execution using ToolRouter.
   * Handles: search → prompt → context window → LLM → follow-ups.
   */
  async runServer(query: string, ctx: ServerRunContext): Promise<AgentOutput> {
    const prepared = await this.prepareServerContext(query, ctx);

    // Build context window from conversation history
    let contextMessages: Array<{ role: "user" | "assistant"; content: string }> = [];
    let contextSummary = "";
    if (ctx.previousMessages && ctx.previousMessages.length > 0) {
      const userTokens = estimateTokens(query) + (ctx.imageData ? 300 : 0);
      const cw = buildContextWindow(ctx.previousMessages, 4000, estimateTokens(prepared.systemPrompt), userTokens);
      contextMessages = cw.messages;
      contextSummary = cw.contextSummary;
    }

    const fullPrompt = contextSummary
      ? prepared.systemPrompt + "\n\n" + contextSummary
      : prepared.systemPrompt;

    const messages: Array<{ role: string; content: unknown }> = [
      { role: "system", content: fullPrompt },
      ...contextMessages,
      {
        role: "user",
        content: ctx.imageData
          ? [
              { type: "text", text: query },
              { type: "image_url", image_url: { url: ctx.imageData } },
            ]
          : query,
      },
    ];

    // LLM call via ToolRouter
    const llmResult = await ctx.dispatchTool(
      { tool: "llm_call", args: { messages, mode: ctx.mode } },
      { requestId: ctx.requestId, mode: ctx.mode, language: ctx.language },
    );

    const responseText = llmResult.ok
      ? ((llmResult.data as { text: string })?.text ?? "")
      : "I encountered an error processing this request.";

    const { mainText, followUps } = extractFollowUps(responseText);
    return { text: mainText, sources: prepared.sources, followUps };
  }

  /**
   * Run search and build system prompt without calling LLM.
   * Used by the streaming path in orchestrate.ts and by runServer().
   */
  async prepareServerContext(query: string, ctx: ServerRunContext): Promise<PreparedContext> {
    let searchResults: Array<{ title: string; link: string; snippet?: string }> = [];
    let sources: Array<{ title: string; uri: string }> = [];

    if (this.shouldSearch(query)) {
      const searchQuery = this.rewriteSearchQuery(query);
      const result = await ctx.dispatchTool(
        { tool: "web_search", args: { query: searchQuery } },
        { requestId: ctx.requestId, mode: ctx.mode, language: ctx.language },
      );
      if (result.ok && result.data) {
        const d = result.data as { results: typeof searchResults; sources: typeof sources };
        searchResults = d.results ?? [];
        sources = d.sources ?? [];
      }
    }

    let systemPrompt = this.buildPrompt(ctx, searchResults);

    // Add previous step context (multi-step workflows)
    if (ctx.previousOutputs && ctx.previousOutputs.length > 0) {
      systemPrompt += "\n\n## CONTEXT FROM PREVIOUS STEPS:\n" +
        ctx.previousOutputs.map((o, i) => `Step ${i + 1}:\n${o.text.slice(0, 1500)}`).join("\n\n") +
        "\n\nUse the above context to inform your response. Do not repeat it — build on it.";
    }

    return { systemPrompt, sources };
  }

  // ── Shared utilities ──

  protected rewriteSearchQuery(query: string): string {
    let q = query
      .replace(/^(can you |please |could you |i want to |tell me |help me |i need |show me |find me |what about )/i, "")
      .replace(/\s*(please|thanks|thank you|asap|urgently|quickly)\.?\s*$/i, "")
      .trim();
    if (q.length > 120) {
      const firstSentence = q.match(/^[^.!?]+[.!?]/);
      q = firstSentence ? firstSentence[0] : q.slice(0, 120);
    }
    return q || query;
  }

  protected buildPrompt(
    ctx: ServerRunContext,
    searchResults: Array<{ title: string; link: string; snippet?: string }>,
  ): string {
    const hasSources = searchResults.length > 0;
    const n = searchResults.length;

    const sourceContext = hasSources
      ? "\n\n---\nSEARCH RESULTS:\n" + searchResults.map((r, i) =>
          `[${i + 1}] ${r.title}\nURL: ${r.link}\n${r.snippet || ""}`
        ).join("\n\n") + "\n---"
      : "";

    const citationRules = hasSources
      ? `## CITATION RULES (CRITICAL):
- You have ${n} search results numbered [1] through [${n}]
- Cite inline: [1], [2], [3] at the END of the relevant sentence
- Example: "India's GDP grew 8.2% in Q1 [1]."
- Group citations: "confirmed by analysts [1][3]."
- ONLY cite numbers from search results above — NEVER fabricate
- Every factual claim from a source MUST include its citation number` + (ctx.wantsLive
        ? "\n- User wants CURRENT data — base answer primarily on search results" : "")
      : (ctx.wantsLive
        ? `## NOTE: No search results available. Do NOT provide specific current statistics or dates from training — they may be outdated. Recommend Research or Browser mode.`
        : `## NOTE: No search results. Answer from knowledge. Do not fabricate URLs.`);

    const imageRule = ctx.hasImage
      ? `\n## IMAGE ANALYSIS:\nAnalyze the image thoroughly — extract text, identify elements, integrate insights.\n`
      : "";

    return `You are **InBharat Ai** (Desh Ka AI) — a world-class AI platform built for Bharat.

**LANGUAGE:** Respond ENTIRELY in ${ctx.langInfo.native} (${ctx.langInfo.name}).

${this.getSystemInstructions()}

${citationRules}${imageRule}

## RESPONSE FORMAT:
- Clean Markdown with **##** headers for sections
- Lead with the most important insight
- Be comprehensive but eliminate fluff
- Use bullet points, tables, **bold** for key terms

## FOLLOW-UP QUESTIONS:
End with exactly 3 insightful follow-up questions in ${ctx.langInfo.native}, each prefixed with FOLLOW_UP:${sourceContext}`;
  }
}
