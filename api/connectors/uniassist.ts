/**
 * UniAssist Connector — stub implementation.
 *
 * Phase 4 will wire this to the real UniAssist API endpoints.
 * For now it returns structured placeholder data so the orchestrator
 * can exercise the full workflow pipeline end-to-end.
 */

import type { AppConnector, ConnectorResult } from "./types";

const UNIASSIST_FUNCTIONS = [
  "university-search",
  "pr-predictor",
  "scholarship-search",
  "profile-review",
] as const;

export class UniAssistConnector implements AppConnector {
  readonly name = "UniAssist";
  readonly functions = [...UNIASSIST_FUNCTIONS];

  async call(
    functionName: string,
    args: Record<string, unknown>,
    _authToken?: string,
  ): Promise<ConnectorResult> {
    // Phase 4: replace stubs with real HTTP calls to UniAssist API
    switch (functionName) {
      case "university-search":
        return {
          ok: true,
          data: {
            universities: [],
            total: 0,
            searchMetadata: { queryInterpreted: args.query ?? "", lang: args.language ?? "EN" },
            _stub: true,
          },
        };

      case "pr-predictor":
        return {
          ok: true,
          data: {
            prScore: 0,
            passProbability: 0,
            factors: { strong: [], weak: [], recommend: ["Connect UniAssist for live predictions"] },
            nextSteps: ["Configure UniAssist API endpoint"],
            _stub: true,
          },
        };

      case "scholarship-search":
        return {
          ok: true,
          data: { scholarships: [], total: 0, _stub: true },
        };

      case "profile-review":
        return {
          ok: true,
          data: {
            score: 0,
            feedback: { strengths: [], gaps: [], actionItems: ["Connect UniAssist for profile review"] },
            estimatedSuccessRate: 0,
            _stub: true,
          },
        };

      default:
        return { ok: false, error: `Unknown function: ${functionName}` };
    }
  }

  async isAvailable(): Promise<boolean> {
    // Phase 4: check if UNIASSIST_API_URL env var is set and reachable
    return false;
  }
}
