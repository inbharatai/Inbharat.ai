/**
 * WorkflowStateManager — persistence layer for workflow state.
 *
 * CRUD operations on the `workflow_state` Supabase table.
 * Falls back gracefully when Supabase is not configured (guest mode).
 */

import type {
  WorkflowState,
  WorkflowStep,
  WorkflowStatus,
  IntentCategory,
  AppTarget,
  WorkflowType,
} from "./types";

// Supabase admin client is only available server-side.
// This module may be imported from the client too (for type reuse),
// so we lazily import supabaseAdmin only when actually persisting.

async function getAdmin() {
  try {
    const mod = await import("../../api/lib/supabaseAdmin.js");
    return mod.supabaseAdmin;
  } catch {
    return null;
  }
}

function generateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `wf_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

// ─── Public API ──────────────────────────────────────────────

export async function createWorkflow(params: {
  userId: string | null;
  sessionId: string;
  workflowType: WorkflowType;
  intentDetected: IntentCategory;
  appTarget: AppTarget;
  steps: WorkflowStep[];
}): Promise<WorkflowState> {
  const id = generateId();
  const now = new Date().toISOString();

  const workflow: WorkflowState = {
    id,
    userId: params.userId,
    sessionId: params.sessionId,
    workflowType: params.workflowType,
    status: "pending",
    intentDetected: params.intentDetected,
    appTarget: params.appTarget,
    steps: params.steps,
    createdAt: now,
    updatedAt: now,
  };

  const admin = await getAdmin();
  if (admin) {
    const { error } = await admin.from("workflow_state").insert({
      id: workflow.id,
      user_id: workflow.userId,
      session_id: workflow.sessionId,
      workflow_type: workflow.workflowType,
      status: workflow.status,
      intent_detected: workflow.intentDetected,
      app_target: workflow.appTarget,
      steps: workflow.steps,
    });
    if (error) {
      console.error("[WorkflowState] insert error:", error.message);
    }
  }

  return workflow;
}

export async function updateWorkflowStatus(
  workflowId: string,
  status: WorkflowStatus,
  steps?: WorkflowStep[],
): Promise<void> {
  const admin = await getAdmin();
  if (!admin) return;

  const payload: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
  if (steps) payload.steps = steps;

  const { error } = await admin
    .from("workflow_state")
    .update(payload)
    .eq("id", workflowId);

  if (error) {
    console.error("[WorkflowState] update error:", error.message);
  }
}

export async function loadWorkflow(workflowId: string): Promise<WorkflowState | null> {
  const admin = await getAdmin();
  if (!admin) return null;

  const { data, error } = await admin
    .from("workflow_state")
    .select("*")
    .eq("id", workflowId)
    .single();

  if (error || !data) return null;

  return {
    id: data.id,
    userId: data.user_id,
    sessionId: data.session_id,
    workflowType: data.workflow_type,
    status: data.status,
    intentDetected: data.intent_detected,
    appTarget: data.app_target,
    steps: data.steps as WorkflowStep[],
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

export async function loadActiveWorkflows(userId: string): Promise<WorkflowState[]> {
  const admin = await getAdmin();
  if (!admin) return [];

  const { data, error } = await admin
    .from("workflow_state")
    .select("*")
    .eq("user_id", userId)
    .in("status", ["pending", "running"])
    .order("updated_at", { ascending: false })
    .limit(10);

  if (error || !data) return [];

  return data.map((d: any) => ({
    id: d.id,
    userId: d.user_id,
    sessionId: d.session_id,
    workflowType: d.workflow_type,
    status: d.status,
    intentDetected: d.intent_detected,
    appTarget: d.app_target,
    steps: d.steps as WorkflowStep[],
    createdAt: d.created_at,
    updatedAt: d.updated_at,
  }));
}

/** Convenience: mark a workflow as completed with final step data. */
export async function completeWorkflow(
  workflowId: string,
  steps: WorkflowStep[],
): Promise<void> {
  await updateWorkflowStatus(workflowId, "completed", steps);
}

/** Convenience: mark a workflow as failed. */
export async function failWorkflow(
  workflowId: string,
  steps?: WorkflowStep[],
): Promise<void> {
  await updateWorkflowStatus(workflowId, "failed", steps);
}

/**
 * Clean up stale workflows: running > 5 min → failed.
 * Call periodically or at handler startup to avoid ghost workflows.
 */
export async function cleanStaleWorkflows(): Promise<number> {
  const admin = await getAdmin();
  if (!admin) return 0;

  const fiveMinAgo = new Date(Date.now() - 5 * 60_000).toISOString();
  const { data, error } = await admin
    .from("workflow_state")
    .update({ status: "failed" })
    .eq("status", "running")
    .lt("updated_at", fiveMinAgo)
    .select("id");

  if (error) {
    console.error("[WorkflowState] cleanup error:", error.message);
    return 0;
  }
  return data?.length ?? 0;
}
