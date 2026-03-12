/**
 * CoderAgent — code generation, debugging, repo/task assistance.
 * Server-side: uses ToolRouter. Client-side: wraps NexusAgent.
 */

import { AgentMode } from "../../types";
import type { AgentInput, AgentOutput, IntentCategory } from "../../lib/orchestration/types";
import { BaseAgent } from "./baseAgent";

let _nexus: any = null;
async function getNexus() {
  if (!_nexus) {
    const mod = await import("../openaiService");
    _nexus = new mod.NexusAgent();
  }
  return _nexus;
}

export class CoderAgent extends BaseAgent {
  readonly name = "Coder";

  canHandle(intent: IntentCategory): boolean {
    return intent === "coding";
  }

  getSystemInstructions(): string {
    return `## MODE: Expert Software Engineer
- Provide complete, production-ready, runnable code in fenced code blocks with language tags
- Include error handling, input validation, edge cases
- Follow current best practices and idiomatic patterns
- Brief approach explanation BEFORE the code
- Never invent APIs or package names \u2014 use standard/well-known libraries`;
  }

  shouldSearch(_query: string): boolean { return false; }

  async run(input: AgentInput): Promise<AgentOutput> {
    const nexus = await getNexus();
    const result = await nexus.executeQuery(
      input.query,
      AgentMode.CODER,
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
