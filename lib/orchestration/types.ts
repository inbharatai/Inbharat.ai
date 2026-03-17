/**
 * Orchestration type definitions for the InBharat agentic platform.
 *
 * These types power the ConversationRouter, WorkflowStateManager,
 * ExecutiveAgent planner, ToolRouter, and ResponseComposer.
 */

import type { AgentMode, Source, WidgetData } from "../../types.js";

// ─── Intent & Routing ────────────────────────────────────────

/** High-level intent categories the router can detect. */
export type IntentCategory =
  | "general"
  | "research"
  | "coding"
  | "education"
  | "shopping"
  | "planning"     // calendar / email / executive tasks
  | "browser"      // explicit live-web request
  | "mixed";       // multi-domain query needing orchestration

/** Which product/app should handle (or co-handle) the request. */
export type AppTarget =
  | "inbharat"
  | "uniassist"
  | "testprep"
  | "mixed";       // needs more than one app

/** The router's output after analysing a user query. */
export interface RouteDecision {
  /** Primary detected intent. */
  intent: IntentCategory;
  /** All detected intents when the query is multi-domain. */
  intents: IntentCategory[];
  /** Which app(s) should fulfill the request. */
  appTarget: AppTarget;
  /** True when the query requires a multi-step workflow. */
  isWorkflow: boolean;
  /** Ordered list of agents/tools the orchestrator should invoke. */
  suggestedSteps: WorkflowStepDraft[];
  /** Optional confidence score 0-1 for the primary intent. */
  confidence?: number;
}

// ─── Workflow State ──────────────────────────────────────────

export type StepStatus = "pending" | "running" | "completed" | "failed" | "skipped";

/** A planned step before execution (no output yet). */
export interface WorkflowStepDraft {
  /** Which agent or connector to invoke. */
  agent: AgentMode | "uniassist" | "testprep";
  /** The sub-query / instruction for the agent. */
  input: string;
  /** IDs of steps whose output is needed first (empty = can run immediately). */
  dependsOn: number[];
}

/** A step with full execution state, stored in Supabase JSONB. */
export interface WorkflowStep extends WorkflowStepDraft {
  id: number;
  status: StepStatus;
  output?: AgentOutput;
  startedAt?: string;   // ISO timestamp
  completedAt?: string;
  errorMessage?: string;
}

export type WorkflowType = "single" | "multi_step";
export type WorkflowStatus = "pending" | "running" | "completed" | "failed";

/** Persisted row in the `workflow_state` Supabase table. */
export interface WorkflowState {
  id: string;            // uuid
  userId: string | null; // null for guest
  sessionId: string;     // links to chat_sessions.id
  workflowType: WorkflowType;
  status: WorkflowStatus;
  intentDetected: IntentCategory;
  appTarget: AppTarget;
  steps: WorkflowStep[];
  createdAt: string;
  updatedAt: string;
}

// ─── Agent I/O ───────────────────────────────────────────────

/** Standardised input every agent receives. */
export interface AgentInput {
  query: string;
  mode: AgentMode;
  language: string;
  imageData?: string;
  signal?: AbortSignal;
  previousMessages?: Array<{ role: "user" | "assistant"; content: string }>;
  /** Outputs from earlier workflow steps (for context chaining). */
  previousOutputs?: AgentOutput[];
}

/** Standardised output every agent returns. */
export interface AgentOutput {
  text: string;
  sources: Source[];
  followUps: string[];
  widget?: WidgetData;
  metadata?: Record<string, unknown>;
}

// ─── Tool Router ─────────────────────────────────────────────

export type ToolName =
  | "web_search"
  | "llm_call"
  | "llm_stream"
  | "app_connector"
  | "tts";

export interface ToolCall {
  tool: ToolName;
  args: Record<string, unknown>;
}

export interface ToolResult {
  tool: ToolName;
  ok: boolean;
  data?: unknown;
  error?: string;
  durationMs?: number;
}

// ─── Response Composer ───────────────────────────────────────

/** Input to the response composer after a workflow completes. */
export interface ComposerInput {
  steps: WorkflowStep[];
  language: string;
  /** If true, include step-by-step breakdown in the final answer. */
  verbose?: boolean;
}
