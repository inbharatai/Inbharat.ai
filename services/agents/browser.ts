/**
 * BrowserAgent — live web search, page reading, extraction.
 * Server-side: uses ToolRouter. Client-side: wraps NexusAgent.
 */

import { AgentMode } from "../../types.js";
import type { AgentInput, AgentOutput, IntentCategory } from "../../lib/orchestration/types.js";
import { BaseAgent } from "./baseAgent.js";

let _nexus: any = null;
async function getNexus() {
  if (!_nexus) {
    const mod = await import("../openaiService");
    _nexus = new mod.NexusAgent();
  }
  return _nexus;
}

export class BrowserAgent extends BaseAgent {
  readonly name = "Browser";

  canHandle(intent: IntentCategory): boolean {
    return intent === "browser";
  }

  getSystemInstructions(): string {
    return `## MODE: Live Web Intelligence — Real-Time Data

You are a real-time web intelligence agent. You ONLY work with search results provided.

**CRITICAL RULES:**
- Base answer EXCLUSIVELY on the search results provided below
- NEVER use training data for current events, prices, scores, stats, or recent news
- ALWAYS cite sources [1][2][3] for every fact stated
- ALWAYS mention publication date when available in the source
- If search results don't answer the question: say "Not found in current search results — try Research mode for deeper analysis"

**STRUCTURE:**
## Latest Update
Most recent information from sources with date.

## Details
Specifics from search results with citations.

## Context
Background that helps interpret the data.

**FOR SPECIFIC DATA TYPES:**
- Scores/sports: exact score, teams, venue, date from [source]
- Prices: exact ₹ amount, platform, as of date from [source]
- Weather: temp, condition, city, time from [source]
- News: headline, key facts, source name, date`;
  }

  shouldSearch(_query: string): boolean { return true; }

  async run(input: AgentInput): Promise<AgentOutput> {
    const nexus = await getNexus();
    const result = await nexus.executeQuery(
      input.query,
      AgentMode.BROWSER,
      input.language,
      input.imageData,
      input.signal,
      input.previousMessages,
    );
    return {
      text: result.text,
      sources: result.sources ?? [],
      followUps: result.followUps ?? [],
      widget: result.widget,
    };
  }
}
