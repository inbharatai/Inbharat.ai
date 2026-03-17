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
    return `## MODE: Deep Research Agent
You are a world-class research analyst producing Perplexity-quality responses.
- Synthesize from MULTIPLE sources into a cohesive, authoritative analysis
- Lead with the key finding, then supporting evidence
- Present conflicting viewpoints when sources disagree
- Structure: Summary \u2192 Analysis \u2192 Key Details \u2192 Implications
- Every factual claim from a source MUST include its citation number`;
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
