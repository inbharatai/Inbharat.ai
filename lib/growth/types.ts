/**
 * InBharat Growth Agent — shared types.
 *
 * Client-safe: no server-only imports here, so the admin UI may import this
 * file without pulling cheerio / supabase / node-only code into the browser
 * bundle. Server modules (lib/growth/* other than this file) are imported only
 * by api/growth/* and scripts/*.
 */

export type GrowthAction =
  | "crawl"
  | "audit"
  | "draft"
  | "createPR"
  | "publish";

export type PublicRepoStatus =
  | "canonical_private"
  | "public_mirror_current"
  | "public_mirror_outdated"
  | "public_demo_only"
  | "deprecated_public_clone"
  | "do_not_use";

export type SourceOfTruth = "canonical_private" | "do_not_use";

export interface AuthorizedAsset {
  domain: string;
  name: string;
  status: string;
  canCrawl: boolean;
  canAudit: boolean;
  canDraft: boolean;
  canCreatePR: boolean;
  canPublishDirectly: boolean;
  requiresHumanApproval: boolean;
  notes?: string;
}

export interface AuthorizedAssetsConfig {
  version: number;
  defaultMode: string;
  assets: AuthorizedAsset[];
}

export interface RepoEntry {
  productName: string;
  productSlug: string;
  canonicalPrivateRepo: string | null;
  publicRepo: string | null;
  websitePath: string | null;
  sourceOfTruth: SourceOfTruth;
  publicRepoStatus: PublicRepoStatus;
  crawlPrivateRepo: boolean;
  crawlPublicRepo: boolean;
  allowAgentRead: boolean;
  allowAgentPR: boolean;
  notes?: string;
}

export interface RepoRegistry {
  version: number;
  repos: RepoEntry[];
}

export type IssueSeverity = "critical" | "high" | "normal" | "low";

export interface AuditIssue {
  severity: IssueSeverity;
  field: string;
  message: string;
  recommendedFix: string;
}

export interface PageMeta {
  title?: string;
  metaDescription?: string;
  metaRobots?: string;
  canonical?: string;
  h1?: string;
  h2Count?: number;
  h3Count?: number;
  internalLinks?: number;
  externalLinks?: number;
  brokenLinks?: number;
  imagesTotal?: number;
  imagesWithoutAlt?: number;
  wordCount?: number;
  schemaTypes?: string[];
  inSitemap?: boolean;
  robotsAllowed?: boolean;
  httpStatus?: number;
  pageDepth?: number;
  hasCta?: boolean;
  faqPresent?: boolean;
  comparisonPresent?: boolean;
  proofPresent?: boolean;
  audienceSignal?: boolean;
}

export interface SeoScore {
  score: number; // 0-100
  issues: AuditIssue[];
}

export interface GeoScore {
  score: number; // 0-100
  issues: AuditIssue[];
}

export interface GrowthPage {
  url: string;
  domain: string;
  httpStatus?: number;
  title?: string;
  metaDescription?: string;
  canonical?: string;
  h1?: string;
  wordCount?: number;
  seoScore: number;
  geoScore: number;
  issues: AuditIssue[];
  meta: PageMeta;
  crawledAt: string;
}

export interface CrawlRun {
  id?: string;
  domain: string;
  status: "running" | "completed" | "failed";
  pagesCount: number;
  avgSeoScore?: number;
  avgGeoScore?: number;
  error?: string;
  startedAt?: string;
  finishedAt?: string;
  pages?: GrowthPage[];
}

export interface AuthorizationDecision {
  allowed: boolean;
  reason: string;
  action: GrowthAction;
  scope: string;
}

export interface PerformanceSnapshot {
  domain: string;
  source: "ga4" | "gsc" | "indexnow" | "uptime";
  metrics: Record<string, unknown>;
  capturedAt: string;
}

export interface ModelUsageRecord {
  model: string;
  task: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: number;
  status: string;
  /** Which article/URL this call served (for the "where used" dashboard). Null for system/audit calls. */
  contextUrl?: string;
  /** Which provider served this call (openai|gemini). Derivable from model but stored for clean grouping. */
  provider?: "openai" | "gemini";
}