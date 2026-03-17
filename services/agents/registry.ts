/**
 * Agent registry — maps AgentMode enum values to concrete BaseAgent instances.
 *
 * Single source of truth for looking up agents by mode.
 * Used by the ExecutiveAgent, the /api/orchestrate endpoint,
 * and any future tool-router or connector.
 */

import { AgentMode } from "../../types.js";
import type { IntentCategory } from "../../lib/orchestration/types.js";
import { BaseAgent } from "./baseAgent.js";
import { StandardAgent } from "./standard.js";
import { ResearcherAgent } from "./researcher.js";
import { CoderAgent } from "./coder.js";
import { EducatorAgent } from "./educator.js";
import { BrowserAgent } from "./browser.js";
import { ShopperAgent } from "./shopper.js";
import { ExecutiveAgent } from "./executive.js";

// Singleton instances — stateless, safe to reuse.
const agents: Record<AgentMode, BaseAgent> = {
  [AgentMode.STANDARD]:  new StandardAgent(),
  [AgentMode.RESEARCH]:  new ResearcherAgent(),
  [AgentMode.CODER]:     new CoderAgent(),
  [AgentMode.EDUCATOR]:  new EducatorAgent(),
  [AgentMode.BROWSER]:   new BrowserAgent(),
  [AgentMode.EXECUTIVE]: new ExecutiveAgent(),
  [AgentMode.SHOPPER]:   new ShopperAgent(),
};

/** Get the agent instance for a given mode. Falls back to Standard. */
export function getAgentForMode(mode: AgentMode): BaseAgent {
  return agents[mode] ?? agents[AgentMode.STANDARD];
}

/** Find the first agent that claims it can handle a given intent. */
export function getAgentForIntent(intent: IntentCategory): BaseAgent {
  for (const agent of Object.values(agents)) {
    if (agent.canHandle(intent)) return agent;
  }
  return agents[AgentMode.STANDARD];
}

/** List all registered agent names (for debugging / health checks). */
export function listAgentNames(): string[] {
  return Object.values(agents).map(a => a.name);
}
