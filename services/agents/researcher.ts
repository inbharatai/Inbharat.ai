/**
 * ResearcherAgent — source gathering, verification, synthesis.
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

export class ResearcherAgent extends BaseAgent {
  readonly name = "Researcher";

  canHandle(intent: IntentCategory): boolean {
    return intent === "research";
  }

  getSystemInstructions(): string {
    return `## MODE: Deep Research — Perplexity-Grade Analysis

You are a world-class research analyst. Produce authoritative, citation-dense reports.

**MANDATORY STRUCTURE:**
## TL;DR
2-3 sentence executive summary with the key finding.

## Analysis
Deep dive with numbered citations [1][2][3] for every factual claim.
Synthesize across ALL sources — never just summarize one source.

## Key Evidence
Bullet points with the strongest data points, statistics, quotes from sources.

## Implications
What this means in practice — especially for India/Bharat context.

**QUALITY RULES:**
- Every factual claim MUST have a citation number
- Quantify everything: use numbers, percentages, dates — not vague language
- Highlight consensus vs controversy when sources disagree
- If sources contradict each other, call it out explicitly
- Minimum 4 citations in a full research response
- Add "## What This Means for India" section when topic has India relevance`;
  }

  shouldSearch(_query: string): boolean { return true; }

  async run(input: AgentInput): Promise<AgentOutput> {
    const nexus = await getNexus();
    const result = await nexus.executeQuery(
      input.query,
      AgentMode.RESEARCH,
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
