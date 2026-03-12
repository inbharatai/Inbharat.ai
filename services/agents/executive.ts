/**
 * ExecutiveAgent — master orchestrator.
 *
 * Responsibilities:
 *  1. Accept a multi-step workflow plan from the ConversationRouter.
 *  2. Analyse dependencies to decide parallel vs sequential execution.
 *  3. Delegate each step to the appropriate agent / connector.
 *  4. Collect outputs and hand them to the ResponseComposer.
 *
 * For single-turn requests it acts as a direct passthrough
 * to the best-matching agent (delegator mode).
 */

import { AgentMode } from "../../types";
import type {
  AgentInput,
  AgentOutput,
  IntentCategory,
} from "../../lib/orchestration/types";
import { BaseAgent } from "./baseAgent";

let _nexus: any = null;
async function getNexus() {
  if (!_nexus) {
    const mod = await import("../openaiService");
    _nexus = new mod.NexusAgent();
  }
  return _nexus;
}

export class ExecutiveAgent extends BaseAgent {
  readonly name = "Executive";

  canHandle(intent: IntentCategory): boolean {
    return intent === "planning" || intent === "mixed";
  }

  getSystemInstructions(): string {
    return `## MODE: Executive Assistant
- Provide structured, actionable output
- Use bullet points, numbered lists, tables
- Include clear next steps or action items
- Be direct — omit filler`;
  }

  shouldSearch(query: string): boolean {
    if (/\b(current|latest|today|recent|schedule|calendar|news|price|score)\b/i.test(query)) return true;
    return false;
  }

  async run(input: AgentInput): Promise<AgentOutput> {
    const nexus = await getNexus();
    const result = await nexus.executeQuery(
      input.query,
      input.mode ?? AgentMode.EXECUTIVE,
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
