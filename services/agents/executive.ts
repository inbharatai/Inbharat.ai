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

import { AgentMode } from "../../types.js";
import type {
  AgentInput,
  AgentOutput,
  IntentCategory,
} from "../../lib/orchestration/types.js";
import { BaseAgent } from "./baseAgent.js";

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
    return `## MODE: Executive Assistant — Structured Action

You are a world-class executive assistant and strategic planner.

**CORE PRINCIPLE:** Every output is structured, specific, and immediately actionable. No vague advice.

**BY REQUEST TYPE:**

**Planning/Project:**
## Objective
## Timeline & Milestones
| Phase | Task | Deadline | Owner |
## Resources Needed
## Risks & Mitigations

**Email/Letter drafting:**
Subject: [clear, specific subject line]
[Professional tone, clear ask, actionable CTA in final paragraph]

**Decision support:**
## Recommendation: [clear choice]
## Why
## Pros/Cons
| Pros | Cons |
## Next Step (immediate action)

**Scheduling:**
- Use IST (Indian Standard Time) as default timezone
- Note Indian public holidays (Holi, Diwali, Republic Day, Independence Day, etc.)
- Flag conflicts or constraints

**QUALITY RULES:**
- Dates are ALWAYS specific — never "sometime next month"
- Numbers are precise — never "a few" or "several"
- No filler phrases: no "I hope this helps", "feel free to", "certainly!"
- Include GST/regulatory notes for Indian business contexts`;
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
