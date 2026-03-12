/**
 * AppConnector interface — defines how InBharat talks to external products.
 *
 * Each connected app (UniAssist, TestPrep) implements this interface.
 * The connector handles authentication, request formatting, and
 * response normalisation back into AgentOutput format.
 */

export interface AppConnector {
  /** Human-readable name of the external app. */
  readonly name: string;

  /** Available function names this connector exposes. */
  readonly functions: string[];

  /**
   * Call a specific function on the external app.
   *
   * @param functionName - One of the functions listed in `functions`.
   * @param args - JSON-serialisable arguments for the function.
   * @param authToken - Optional auth token for the external app (Comet-style login context).
   * @returns The external app's response, normalised to a generic shape.
   */
  call(functionName: string, args: Record<string, unknown>, authToken?: string): Promise<ConnectorResult>;

  /**
   * Check if the connector is currently available (API reachable, keys configured, etc.).
   */
  isAvailable(): Promise<boolean>;
}

export interface ConnectorResult {
  ok: boolean;
  data?: Record<string, unknown>;
  error?: string;
}

// ─── UniAssist function signatures ───────────────────────────

export interface UniversitySearchArgs {
  query: string;
  language: string;
  userId?: string;
  context?: {
    examScores?: Record<string, number>;
    budget?: number;
    timeline?: string;
  };
}

export interface PRPredictorArgs {
  userProfile: {
    academicsScore: number;
    workExperienceYears: number;
    ieltsScore?: number;
    countryOfInterest: string;
  };
  language: string;
}

export interface ScholarshipSearchArgs {
  fieldOfStudy: string;
  country: string;
  incomeLevel: "LOW" | "MEDIUM" | "HIGH";
  language: string;
}

export interface ProfileReviewArgs {
  userId: string;
  reviewType: "QUICK" | "DETAILED";
  language: string;
}

// ─── TestPrep function signatures ────────────────────────────

export interface ExamSelectorArgs {
  goal: string;
  country?: string;
  field?: string;
  language: string;
}

export interface StudyPlanArgs {
  exam: string;
  durationWeeks: number;
  currentLevel: "BEGINNER" | "INTERMEDIATE" | "ADVANCED";
  language: string;
}

export interface PracticeGeneratorArgs {
  exam: string;
  topic: string;
  difficulty: "EASY" | "MEDIUM" | "HARD";
  count: number;
  language: string;
}

export interface PerformanceAnalysisArgs {
  userId: string;
  exam: string;
  recentTestScores: Array<{ date: string; score: number }>;
  language: string;
}
