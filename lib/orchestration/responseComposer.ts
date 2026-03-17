/**
 * ResponseComposer — merges outputs from multiple agents/steps
 * into a single user-facing response.
 *
 * Rules:
 *  - Combine text with clear section headings per step.
 *  - Aggregate all sources (deduplicated by URI).
 *  - Collect follow-ups from every step (limit 5 total).
 *  - Attach the first widget found (UI can only show one at a time).
 */

import type { AgentOutput, ComposerInput } from "./types.js";
import type { Source, WidgetData } from "../../types.js";

export function composeResponse(input: ComposerInput): AgentOutput {
  const { steps, verbose } = input;

  const completedSteps = steps.filter(s => s.status === "completed" && s.output);

  if (completedSteps.length === 0) {
    const failedStep = steps.find(s => s.status === "failed");
    return {
      text: failedStep?.errorMessage
        ? `I encountered an issue: ${failedStep.errorMessage}`
        : "I wasn't able to complete this request. Please try again.",
      sources: [],
      followUps: ["Try a simpler question", "Break this into separate queries"],
    };
  }

  // Single step — return as-is (no merge overhead)
  if (completedSteps.length === 1) {
    return completedSteps[0].output!;
  }

  // Friendly labels for section headers (AgentMode enums are ALL CAPS)
  const STEP_LABELS: Record<string, string> = {
    RESEARCH: "Research", CODER: "Code", EDUCATOR: "Explanation",
    BROWSER: "Web Results", SHOPPER: "Shopping", EXECUTIVE: "Plan",
    STANDARD: "Response", uniassist: "UniAssist", testprep: "TestPrep",
  };

  // Multi-step merge
  const textParts: string[] = [];
  const allSources: Source[] = [];
  const allFollowUps: string[] = [];
  let widget: WidgetData | undefined;
  const seenUris = new Set<string>();

  for (const step of completedSteps) {
    const out = step.output!;

    // Section header for verbose mode
    if (verbose) {
      const raw = typeof step.agent === "string" ? step.agent : String(step.agent);
      const label = STEP_LABELS[raw] || raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
      textParts.push(`### ${label}\n\n${out.text}`);
    } else {
      textParts.push(out.text);
    }

    // Deduplicate sources by URI
    for (const src of out.sources ?? []) {
      if (!seenUris.has(src.uri)) {
        seenUris.add(src.uri);
        allSources.push(src);
      }
    }

    // Collect follow-ups
    for (const fu of out.followUps ?? []) {
      if (!allFollowUps.includes(fu)) allFollowUps.push(fu);
    }

    // Keep first widget
    if (!widget && out.widget) {
      widget = out.widget;
    }
  }

  // Note any failed steps
  const failedSteps = steps.filter(s => s.status === "failed");
  if (failedSteps.length > 0) {
    const failedNames = failedSteps.map(s =>
      typeof s.agent === "string" ? s.agent : s.agent
    ).join(", ");
    textParts.push(`\n\n> **Note:** Some steps could not be completed (${failedNames}). You can ask about them separately.`);
  }

  return {
    text: textParts.join("\n\n---\n\n"),
    sources: allSources,
    followUps: allFollowUps.slice(0, 5),
    widget,
  };
}
