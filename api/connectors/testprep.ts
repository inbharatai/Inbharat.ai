/**
 * TestPrep Connector — stub implementation.
 *
 * Phase 4 will wire this to the real TestPrep API endpoints.
 * For now it returns structured placeholder data so the orchestrator
 * can exercise the full workflow pipeline end-to-end.
 */

import type { AppConnector, ConnectorResult } from "./types";

const TESTPREP_FUNCTIONS = [
  "exam-selector",
  "study-plan-generator",
  "practice-generator",
  "performance-analysis",
] as const;

export class TestPrepConnector implements AppConnector {
  readonly name = "TestPrep";
  readonly functions = [...TESTPREP_FUNCTIONS];

  async call(
    functionName: string,
    _args: Record<string, unknown>,
    _authToken?: string,
  ): Promise<ConnectorResult> {
    // Phase 4: replace stubs with real HTTP calls to TestPrep API
    switch (functionName) {
      case "exam-selector":
        return {
          ok: true,
          data: {
            recommendedExams: [],
            _stub: true,
          },
        };

      case "study-plan-generator":
        return {
          ok: true,
          data: {
            weeklyPlan: [],
            totalHoursRequired: 0,
            _stub: true,
          },
        };

      case "practice-generator":
        return {
          ok: true,
          data: {
            questions: [],
            total: 0,
            _stub: true,
          },
        };

      case "performance-analysis":
        return {
          ok: true,
          data: {
            currentScore: 0,
            targetScore: 0,
            progress: { trend: "IMPROVING", avgWeeklyImprovement: 0, weeksToTarget: 0 },
            weakAreas: [],
            nextFocusAreas: ["Connect TestPrep for live analysis"],
            _stub: true,
          },
        };

      default:
        return { ok: false, error: `Unknown function: ${functionName}` };
    }
  }

  async isAvailable(): Promise<boolean> {
    // Phase 4: check if TESTPREP_API_URL env var is set and reachable
    return false;
  }
}
