/**
 * Pure "Publish Console" stop-point derivation — given a draft's kind + status +
 * a few signals (has critique, has a published URL, syndication ledger count),
 * compute where in the last-mile flow it's stopped and what's needed to advance.
 *
 * React-free so scripts/test-growth.ts can drive it with fixtures (no DOM). The
 * Issues page renders the stepper; this module only derives.
 *
 * HONESTY CONTRACT: the stages mirror the existing pipeline (drafted → reviewed →
 * approved → published → syndicated for articles; drafted → approved → published
 * for LinkedIn/cover). inbox-outline + media-candidate drafts have NO publish
 * target (they feed the agent, not a platform) → noPublishTarget=true, and the
 * stepper is a single "drafted" node. Nothing here mutates or publishes.
 */

export type StopStageId =
  | "drafted"
  | "reviewed"
  | "approved"
  | "published"
  | "syndicated";

export interface StopStage {
  id: StopStageId;
  label: string;
  /** true once this stage has been reached. */
  reached: boolean;
  /** true for the stage the draft is currently parked at (the stop-point). */
  stoppedHere: boolean;
}

export interface StopPoint {
  stages: StopStage[];
  /** the id of the stop-point stage, or null for no-publish-target drafts. */
  stopStage: StopStageId | null;
  /** the human action that advances from the stop-point, or null at the end / no-target. */
  nextAction: string | null;
  /** true for kinds that feed the agent, not a platform (inbox-outline, media-candidate). */
  noPublishTarget: boolean;
}

/** Kinds that have no publish target — they feed the agent, not a platform. */
const NO_PUBLISH_TARGET = new Set(["inbox-outline", "media-candidate"]);

const ARTICLE_STAGES: StopStageId[] = ["drafted", "reviewed", "approved", "published", "syndicated"];
const SIMPLE_STAGES: StopStageId[] = ["drafted", "approved", "published"];

const LABEL: Record<StopStageId, string> = {
  drafted: "Drafted",
  reviewed: "Reviewed",
  approved: "Approved",
  published: "Published",
  syndicated: "Syndicated",
};

export interface StopPointInput {
  kind: string;
  status: string;
  hasCritique?: boolean;
  hasPublishedUrl?: boolean;
  syndicationCount?: number;
}

/** True for drafts that feed the agent rather than a publish platform. */
export function hasNoPublishTarget(kind: string): boolean {
  return NO_PUBLISH_TARGET.has(kind);
}

/** Derive the stop-point stepper for a draft. Pure + testable. */
export function deriveStopPoint(input: StopPointInput): StopPoint {
  const kind = input.kind ?? "";
  if (NO_PUBLISH_TARGET.has(kind)) {
    return {
      stages: [{ id: "drafted", label: LABEL.drafted, reached: true, stoppedHere: true }],
      stopStage: "drafted",
      nextAction: null,
      noPublishTarget: true,
    };
  }

  const isArticle = kind === "article" || kind === "video-script";
  const order = isArticle ? ARTICLE_STAGES : SIMPLE_STAGES;
  const status = (input.status ?? "").toLowerCase();

  // Determine the furthest reached stage from the raw signals.
  const reachedSet = new Set<StopStageId>();
  reachedSet.add("drafted"); // a row exists → drafted
  if (isArticle && input.hasCritique) reachedSet.add("reviewed");
  if (status === "approved" || status === "published") reachedSet.add("approved");
  if (status === "published" || input.hasPublishedUrl) reachedSet.add("published");
  if ((input.syndicationCount ?? 0) > 0) reachedSet.add("syndicated");

  // The stop-point = the furthest reached stage in the order.
  let stopStage: StopStageId = "drafted";
  for (const s of order) {
    if (reachedSet.has(s)) stopStage = s;
  }
  const stopIdx = order.indexOf(stopStage);

  // Reached is monotonic: every stage at or before the stop-point is reached (a
  // published article has necessarily been reviewed, even if the critique signal
  // wasn't passed in). This keeps the stepper honest — no gaps ahead of the stop.
  const stages: StopStage[] = order.map((id, i) => ({
    id,
    label: LABEL[id],
    reached: i <= stopIdx,
    stoppedHere: id === stopStage,
  }));

  // Next action = the action that ENTERS the next stage (advance from the stop).
  const nextId = stopIdx >= 0 && stopIdx < order.length - 1 ? order[stopIdx + 1] : null;
  const nextAction = nextId ? ENTER_ACTION_BY_STAGE[nextId] : null;

  return { stages, stopStage, nextAction, noPublishTarget: false };
}

/** The human action that ENTERS each stage (i.e. advances from the prior stop).
 *  `drafted` is never a "next" (it's the initial state) — kept for completeness. */
const ENTER_ACTION_BY_STAGE: Record<StopStageId, string> = {
  drafted: "Draft is saved.",
  reviewed: "Run the critique + redraft loop, then approve.",
  approved: "Approve the draft to mark it ready to publish.",
  published: "Publish to the platform (human-gated).",
  syndicated: "Syndicate to cross-post platforms (human-gated).",
};