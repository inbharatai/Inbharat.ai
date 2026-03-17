/**
 * ConversationRouter — deterministic intent classification and app routing.
 *
 * Analyses a user query to decide:
 *  1. Which intent category (research, coding, education, shopping, …)
 *  2. Which product/app should handle it (InBharat, UniAssist, TestPrep)
 *  3. Whether the request needs multi-step orchestration
 *  4. An ordered list of steps for the ExecutiveAgent
 *
 * This is a cost-zero layer — no LLM calls, purely keyword / regex heuristics.
 * Phase 5 will optionally add an LLM "tie-breaker" for ambiguous queries.
 */

import { AgentMode } from "../../types.js";
import type {
  IntentCategory,
  AppTarget,
  RouteDecision,
  WorkflowStepDraft,
} from "./types.js";

// ─── Keyword dictionaries ────────────────────────────────────

const INTENT_PATTERNS: Record<IntentCategory, RegExp> = {
  research: /\b(research|find\s+(?:out|about)|investigate|compare\s+(?:and|the|between)|comparison|analyse|analyze|report\s+on|survey|sources?|cited?|statistics?|data\s+on|study\s+(?:on|about))\b/i,
  coding: /\b(code\s|program\s|debug|function\s|\bapi\b|script\s|compile|syntax|algorithm|refactor|deploy\s+(?:to|on|a)|build\s+a\s+(?:app|website|tool|bot|api|script)|create\s+(?:a\s+)?(?:app|website|tool|bot)|\bhtml\b|\bcss\b|\bjavascript\b|\bpython\b|\breact\b|\bnode\b|\btypescript\b|\bsql\b|\bregex\b|\bgit\b|write\s+(?:a\s+)?(?:code|function|class|script|program))\b/i,
  education: /\b(explain\s+(?:how|what|why|the|\w{4,})|teach\s+me|learn\s+(?:about|how)|understand\s+(?:the|how|why)|concept\s+of|definition\s+of|what\s+is\s+(?:a|an)\s+\w{4,}|how\s+does\s+\w+\s+work|tutorial|\banalogy\b|simplify|\beli5\b|beginner\s+guide|curriculum|lesson\s+on|homework|assignment)\b/i,
  shopping: /\b(buy\s+(?:a|an|the|some|me|it|this)|price\s+of|shop\s+for|cheapest\s+\w|most\s+expensive|discount\s+(?:on|for|code)|deal\s+on|amazon|flipkart|recommend\s+(?:a\s+)?(?:phone|laptop|camera|gift|gadget)|best\s+(?:for\s+)?money|compare\s+(?:prices?|products?))\b/i,
  planning: /\b(draft\s+(?:a\s+)?(?:email|mail|letter)|calendar\s+(?:event|invite)|schedule\s+(?:a|my)|meeting\s+(?:invite|agenda)|appointment|remind\s+me|agenda\s+for|organize\s+(?:a|my)|plan\s+(?:a|my))\b/i,
  browser: /\b(search\s+(?:the\s+)?web|browse|latest\s+news|current\s+(?:status|score|price|weather)|live\s+(?:score|update|status)|right\s+now|today(?:'s|\s+(?:news|weather|score|date|events?))|this\s+week|breaking\s+news|real[-\s]time|what\s+is\s+the\s+(?:weather|temperature|score|time|date|status))\b/i,
  general: /./,  // fallback — matches anything
  mixed: /(?!)/, // never matches on its own; set programmatically
};

const UNIASSIST_PATTERNS = /\b(universit(?:y|ies)|admission|study\s+abroad|masters?\s+(?:in|abroad|degree)|phd|bachelor|college|visa|immigration|pr\s+(?:chance|score|predictor|points)|permanent\s+residen|scholarship|ielts\s+for\s+(?:admission|university)|gpa|transcript|sop|lor)\b/i;
const TESTPREP_PATTERNS = /\b(ielts|gmat|gre|jee|neet|cat|gate|upsc|toefl|sat|exam\s+prep|practice\s+(?:test|question|problem)|mock\s+test|study\s+plan|score\s+(?:improv|predict|target)|weak\s+(?:area|topic)|syllabus)\b/i;

/**
 * Conjunction / multi-task signal — requires explicit sequencing language.
 * "then" alone is too greedy (matches "back then", "since then").
 * Requires: ", then" | "and also" | "after that" | "first...then" | ", next" | ", finally"
 */
const MULTI_STEP_SIGNAL = /(?:,\s*(?:then|also|after\s+that|next|finally|plus|as\s+well)\s+|\band\s+also\b|\bafter\s+that\b|\bfirst\b.{3,80}\bthen\b)/i;

// ─── Helpers ─────────────────────────────────────────────────

function detectIntents(query: string): IntentCategory[] {
  const found: IntentCategory[] = [];
  const ordered: IntentCategory[] = [
    "research", "coding", "education", "shopping", "planning", "browser",
  ];
  for (const intent of ordered) {
    if (INTENT_PATTERNS[intent].test(query)) {
      found.push(intent);
    }
  }
  if (found.length === 0) return ["general"];

  // ── Intent conflict resolution ──
  // When multiple intents fire, resolve ambiguity with priority rules:

  // browser supersedes education (e.g. "What is the weather today" → browser, not education)
  if (found.includes("browser") && found.includes("education")) {
    found.splice(found.indexOf("education"), 1);
  }

  // browser supersedes research for recency queries
  if (found.includes("browser") && found.includes("research") && found.length === 2) {
    found.splice(found.indexOf("research"), 1);
  }

  // coding supersedes education (e.g. "explain how to write a python script" → coding)
  if (found.includes("coding") && found.includes("education")) {
    found.splice(found.indexOf("education"), 1);
  }

  return found.length > 0 ? found : ["general"];
}

function detectAppTarget(query: string): AppTarget {
  const wantsUni = UNIASSIST_PATTERNS.test(query);
  const wantsTest = TESTPREP_PATTERNS.test(query);
  if (wantsUni && wantsTest) return "mixed";
  if (wantsUni) return "uniassist";
  if (wantsTest) return "testprep";
  return "inbharat";
}

function intentToAgent(intent: IntentCategory): AgentMode {
  switch (intent) {
    case "research": return AgentMode.RESEARCH;
    case "coding":   return AgentMode.CODER;
    case "education":return AgentMode.EDUCATOR;
    case "shopping": return AgentMode.SHOPPER;
    case "planning": return AgentMode.EXECUTIVE;
    case "browser":  return AgentMode.BROWSER;
    default:         return AgentMode.STANDARD;
  }
}

/**
 * Split a multi-part query into sub-tasks.
 *
 * Only splits on explicit multi-task conjunctions (", then", ", and also", ", after that",
 * ", next", ", finally"). Does NOT split on periods — those are normal sentence boundaries.
 * Returns the original query as a single item if it can't be split.
 */
function splitQueryIntoSubTasks(query: string): string[] {
  // Only split on explicit sequencing conjunctions
  const parts = query
    .split(/,\s*(?:then|and\s+also|after\s+that|next|finally)\s+/i)
    .map(s => s.trim())
    .filter(s => s.length > 3); // Discard trivially small fragments
  return parts.length > 1 ? parts : [query];
}

function buildSteps(
  intents: IntentCategory[],
  subTasks: string[],
  appTarget: AppTarget,
  _originalQuery: string,
): WorkflowStepDraft[] {
  const steps: WorkflowStepDraft[] = [];

  // If we managed to split into multiple sub-tasks, create one step per sub-task
  if (subTasks.length > 1) {
    for (let i = 0; i < subTasks.length; i++) {
      const subIntents = detectIntents(subTasks[i]);
      const subApp = detectAppTarget(subTasks[i]);
      const agent: WorkflowStepDraft["agent"] =
        subApp === "uniassist" ? "uniassist" :
        subApp === "testprep" ? "testprep" :
        intentToAgent(subIntents[0]);

      steps.push({
        agent,
        input: subTasks[i],
        // By default each step depends on the previous (sequential).
        // The planner/executive may later promote some to parallel.
        dependsOn: i > 0 ? [i - 1] : [],
      });
    }
    return steps;
  }

  // Single sub-task but multiple intents or external apps
  if (appTarget === "mixed" || appTarget === "uniassist" || appTarget === "testprep") {
    // Add InBharat research step first, then external connector
    if (intents.some(i => i !== "general")) {
      steps.push({
        agent: intentToAgent(intents.find(i => i !== "general") || "general"),
        input: _originalQuery,
        dependsOn: [],
      });
    }
    if (appTarget === "uniassist" || appTarget === "mixed") {
      steps.push({ agent: "uniassist", input: _originalQuery, dependsOn: steps.length > 0 ? [0] : [] });
    }
    if (appTarget === "testprep" || appTarget === "mixed") {
      steps.push({ agent: "testprep", input: _originalQuery, dependsOn: steps.length > 0 ? [0] : [] });
    }
    return steps;
  }

  // Single intent, single app — one step
  steps.push({
    agent: intentToAgent(intents[0]),
    input: _originalQuery,
    dependsOn: [],
  });
  return steps;
}

// ─── Public API ──────────────────────────────────────────────

export function routeQuery(
  query: string,
  /** The mode the user explicitly selected in the UI (may override). */
  explicitMode?: AgentMode,
): RouteDecision {
  const intents = detectIntents(query);
  const appTarget = detectAppTarget(query);
  const subTasks = splitQueryIntoSubTasks(query);
  const hasMultiStepSignal = MULTI_STEP_SIGNAL.test(query);

  // Build steps first, then determine if it's actually a workflow
  const isMultiTask = subTasks.length > 1 || appTarget !== "inbharat" || hasMultiStepSignal;

  const steps = isMultiTask
    ? buildSteps(intents, subTasks, appTarget, query)
    : [{
        agent: (explicitMode && explicitMode !== AgentMode.STANDARD
          ? explicitMode
          : intentToAgent(intents[0])) as WorkflowStepDraft["agent"],
        input: query,
        dependsOn: [] as number[],
      }];

  // Only mark as workflow if we actually produced multiple steps
  const isWorkflow = steps.length > 1;

  const primaryIntent: IntentCategory =
    intents.length > 1 ? "mixed" : intents[0];

  return {
    intent: primaryIntent,
    intents,
    appTarget,
    isWorkflow,
    suggestedSteps: steps,
    confidence: intents.length === 1 ? 0.9 : 0.7,
  };
}
