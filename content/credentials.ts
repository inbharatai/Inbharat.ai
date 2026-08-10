/**
 * Single source of truth for founder / company credentials, recognitions and
 * certifications.
 *
 * WHY THIS FILE EXISTS
 * Before this, the only credential anywhere on the site was a hardcoded
 * "Hyperagent Founding 500" pill in the Landing hero. Every new recognition
 * meant hand-editing JSX in two places and hoping the JSON-LD stayed in sync.
 * Everything credential-shaped now reads from here: the landing hero rail, the
 * landing trust card, and the
 * `hasCredential` / `award` structured data on both pages.
 *
 * ACCURACY RULES (do not relax these)
 *  - `title` and `issuer` must match what the issuing body actually calls it.
 *  - `holder` is 'org' when the recognition belongs to the legal entity and
 *    'person' when it belongs to Reeturaj. The DPIIT recognition is held by
 *    Uni Guru Technologies LLP, NOT by "InBharat.ai" — stating otherwise
 *    misrepresents a Government of India recognition.
 *  - `verifyUrl` is only set when a real, public verification link exists.
 *    Never invent one. `undefined` renders as a plain badge with no link.
 *  - Nothing here implies partnership, endorsement or sponsorship. Programme
 *    participation is described as participation.
 *  - OpenAI Partner Network: accepted after application review and partner
 *    onboarding completed (2026), so "member of the OpenAI Partner Network" is
 *    supported. It still carries no `logo`: OpenAI grants badging through the
 *    partner portal, so only an asset OpenAI actually issues may be used, and
 *    it must follow their brand terms. Do not upgrade this to a bare "OpenAI
 *    Partner" badge or imply endorsement of InBharat's products.
 *
 * ARTWORK
 * `logo` is intentionally optional and currently unset for every entry: the
 * repo ships no official badge artwork, and recreating an issuer's logo is
 * worse than not showing one. Entries render as typographic badges. Drop an
 * official asset into /public/credentials/ and set `logo` to swap it in — no
 * component changes needed.
 */

export type CredentialCategory =
  /** Government / statutory recognition of the company. */
  | 'recognition'
  /** Accelerator, cohort or startup programme selection. */
  | 'program'
  /** Completed course with an issued certificate. */
  | 'certification'
  /** Platform badge earned through demonstrated activity. */
  | 'badge';

export type Credential = {
  /** Stable key. Used for React keys and analytics — do not reuse or recycle. */
  id: string;
  /** Exactly as the issuer names it. */
  title: string;
  /** The issuing body. */
  issuer: string;
  category: CredentialCategory;
  /** Who holds it: the legal entity, or Reeturaj personally. */
  holder: 'org' | 'person';
  /** Display-ready period, e.g. '2026'. Kept as a string: some are cohorts, not dates. */
  period?: string;
  /** ISO date when the credential was issued, where a precise date is known. */
  issuedOn?: string;
  /** One line, factual. Rendered in the full showcase, not the compact rail. */
  description: string;
  /** Public verification link. Only set when one genuinely exists. */
  verifyUrl?: string;
  /** Path under /public. Unset today — see ARTWORK note above. */
  logo?: string;
  /** Short label for the compact hero rail. Keep under ~28 chars. */
  short: string;
  /** Show in the compact landing hero rail. Keep this list tight. */
  featured?: boolean;
};

export const CREDENTIALS: Credential[] = [
  {
    id: 'dpiit',
    title: 'DPIIT-Recognised Startup — Artificial Intelligence & Machine Learning',
    issuer: 'Department for Promotion of Industry and Internal Trade, Government of India',
    category: 'recognition',
    holder: 'org',
    period: '2026',
    description:
      'Uni Guru Technologies LLP is officially recognised as a startup by the Department for Promotion of Industry and Internal Trade, Government of India, in the Artificial Intelligence and Machine Learning sector.',
    short: 'DPIIT Recognised',
    featured: true,
  },
  {
    id: 'stanford-seed-spark',
    title: 'Stanford Seed Spark 2026',
    issuer: 'Stanford Seed, Stanford Graduate School of Business',
    category: 'program',
    holder: 'person',
    period: '2026',
    description:
      'Selected for Stanford Seed Spark 2026, a Stanford Graduate School of Business programme supporting founders building businesses in emerging economies.',
    short: 'Stanford Seed Spark ’26',
    featured: true,
  },
  {
    id: 'openai-partner-network',
    title: 'OpenAI Partner Network',
    issuer: 'OpenAI',
    category: 'program',
    holder: 'org',
    period: '2026',
    description:
      'Member of the OpenAI Partner Network, with partner onboarding completed in 2026.',
    short: 'OpenAI Partner Network',
    featured: true,
  },
  {
    id: 'google-genai-academy-apac',
    title: 'Google Cloud Gen AI Academy — APAC Cohort 3, 2026',
    issuer: 'Google Cloud',
    category: 'program',
    holder: 'person',
    period: '2026',
    description:
      'Participant in the Google Cloud Gen AI Academy, APAC Cohort 3 (2026), covering applied generative AI and production deployment on Google Cloud.',
    short: 'Google Cloud Gen AI Academy',
    featured: true,
  },
  {
    id: 'hyperagent-founding-500',
    title: 'Hyperagent Founding 500 — Founding Member',
    issuer: 'Hyperagent',
    category: 'program',
    holder: 'person',
    period: '2026',
    description:
      'Founding member of the Hyperagent Founding 500 cohort, building agentic AI workflows in production.',
    short: 'Hyperagent Founding 500',
    featured: true,
  },
  {
    id: 'sarvam-startup-program',
    title: 'Sarvam Startup Program',
    issuer: 'Sarvam AI',
    category: 'program',
    holder: 'org',
    period: '2026',
    description:
      'Participant in the Sarvam Startup Program, building on Indic-language AI models for Bharat-first voice and text products.',
    short: 'Sarvam Startup Program',
    featured: true,
  },
  {
    id: 'google-5day-ai-agents',
    title: '5-Day AI Agents: Intensive Vibe Coding Course with Google',
    issuer: 'Google Developer Program',
    category: 'certification',
    holder: 'person',
    period: '2026',
    description:
      'Recognised by the Google Developer Program for hands-on work in Google Cloud and agentic AI, with a qualifying project portfolio spanning orchestration, observability and production readiness.',
    short: '5-Day AI Agents, Google',
  },
  {
    id: 'gemini-enterprise-agent-ready',
    title: 'Gemini Enterprise Agent Ready',
    issuer: 'Google Developer Program',
    category: 'badge',
    holder: 'person',
    period: '2026',
    description:
      'Badge awarded through the Google Developer Program for demonstrated activity across Gemini, Google Cloud and agentic-AI development.',
    short: 'Gemini Enterprise Agent Ready',
  },
  {
    id: 'google-developer-premium',
    title: 'Google Developer Program — Premium Tier',
    issuer: 'Google for Developers',
    category: 'badge',
    holder: 'person',
    period: '2026',
    description:
      'Premium tier membership of the Google Developer Program, based on qualifying participation within the Google developer ecosystem.',
    short: 'Google Developer Premium',
  },
  {
    id: 'google-nvidia-community',
    title: 'Google Cloud & NVIDIA Community Member',
    issuer: 'Google for Developers',
    category: 'badge',
    holder: 'person',
    period: '2026',
    description: 'Member of the Google Cloud and NVIDIA developer community.',
    short: 'Google Cloud & NVIDIA',
  },
  {
    id: 'anthropic-mcp',
    title: 'Introduction to Model Context Protocol',
    issuer: 'Anthropic Education',
    category: 'certification',
    holder: 'person',
    period: '2026',
    issuedOn: '2026-07-13',
    description:
      'Certificate of completion for Introduction to Model Context Protocol, issued by Anthropic Education.',
    short: 'Anthropic — MCP',
  },
  {
    id: 'anthropic-ai-fluency',
    title: 'AI Fluency for Educators',
    issuer: 'Anthropic Education',
    category: 'certification',
    holder: 'person',
    period: '2026',
    issuedOn: '2026-07-13',
    description:
      'Certificate of completion for AI Fluency for Educators, issued by Anthropic Education.',
    short: 'Anthropic — AI Fluency',
  },
  {
    id: 'microsoft-ai-journey',
    title: 'Embark on Your AI Journey with Free AI Tools',
    issuer: 'Microsoft Education',
    category: 'certification',
    holder: 'person',
    period: '2026',
    description:
      'Completed the Microsoft Education module on using accessible AI tools to improve teaching, learning, creativity and productivity.',
    verifyUrl:
      'https://learn.microsoft.com/api/achievements/share/en-us/REETURAJGOSWAMI-1404/ZJSRKMU2?sharingId=786468AD71B08C03',
    short: 'Microsoft — AI Journey',
  },
  {
    id: 'microsoft-empower-educators',
    title: 'Empower Educators to Explore the Potential of Artificial Intelligence',
    issuer: 'Microsoft Education',
    category: 'certification',
    holder: 'person',
    period: '2026',
    description:
      'Completed the Microsoft Education module on how AI can support teaching, personalise learning and improve productivity.',
    verifyUrl:
      'https://learn.microsoft.com/api/achievements/share/en-us/REETURAJGOSWAMI-1404/CR7LNS59?sharingId=786468AD71B08C03',
    short: 'Microsoft — Empower Educators',
  },
];

/** Compact set for the landing hero rail, in display order. */
export const FEATURED_CREDENTIALS = CREDENTIALS.filter((c) => c.featured);

export const CATEGORY_LABEL: Record<CredentialCategory, string> = {
  recognition: 'Government Recognition',
  program: 'Programs & Cohorts',
  certification: 'Certifications',
  badge: 'Developer Badges',
};

/**
 * schema.org `EducationalOccupationalCredential` nodes for the `hasCredential`
 * property of a Person or Organization. Split by holder so the DPIIT
 * recognition attaches to the company and the rest attach to Reeturaj.
 */
export function credentialSchemaNodes(holder: 'org' | 'person') {
  return CREDENTIALS.filter((c) => c.holder === holder).map((c) => ({
    '@type': 'EducationalOccupationalCredential',
    name: c.title,
    credentialCategory: CATEGORY_LABEL[c.category],
    ...(c.issuedOn ? { dateCreated: c.issuedOn } : {}),
    ...(c.verifyUrl ? { url: c.verifyUrl } : {}),
    recognizedBy: { '@type': 'Organization', name: c.issuer },
  }));
}

/** schema.org `award` strings — a flat, human-readable list. */
export function awardStrings(holder: 'org' | 'person'): string[] {
  return CREDENTIALS.filter((c) => c.holder === holder).map((c) => `${c.title} — ${c.issuer}`);
}
