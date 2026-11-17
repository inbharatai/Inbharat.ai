/** Canonical company portfolio. Destinations and descriptions preserved from the
 * existing landing directory / English resources. Portfolio membership does not
 * imply integration with UnoOne or shared data, memory or execution. */
export type ProductBucket = 'core' | 'agentOps' | 'consumer' | 'eduCareer' | 'health' | 'growth';
export type ProductRecord = {
  readonly id: string;
  readonly name: string;
  readonly bucket: ProductBucket;
  readonly description: string;
  readonly href: string;
  readonly internal: boolean;
  readonly color: string;
  readonly logo: string | null;
  readonly relation: 'flagship' | 'independent';
};

export const PRODUCT_CATEGORIES = [
  {
    "key": "core",
    "label": "InBharat Core AI"
  },
  {
    "key": "agentOps",
    "label": "Business & Ops"
  },
  {
    "key": "consumer",
    "label": "Consumer & Culture"
  },
  {
    "key": "eduCareer",
    "label": "Education & Careers"
  },
  {
    "key": "health",
    "label": "Health & Public Service"
  },
  {
    "key": "growth",
    "label": "Growth & Publishing"
  }
] as const;

export const PRODUCT_REGISTRY: readonly ProductRecord[] = [
  {
    "id": "inbharat-ai",
    "name": "InBharat AI",
    "bucket": "core",
    "description": "A separate web console for agentic search and chat, with specialist modes for coding, education, research, shopping and enterprise work. Not the UnoOne local agent.",
    "href": "/app",
    "internal": true,
    "color": "#f59f4f",
    "logo": "/inbharat-logo.svg",
    "relation": "independent"
  },
  {
    "id": "jak-swarm",
    "name": "JAK Swarm",
    "bucket": "agentOps",
    "description": "JAK Swarm turns scattered company context into approved agent work with evidence-backed artifacts, drift detection, executable specs, and reviewer gates. Open-source and self-hostable, with JAK Shield for risk-based approvals, sandboxed execution, and tamper-evident audit trails.",
    "href": "https://github.com/inbharatai/jak-swarm",
    "internal": false,
    "color": "#ef4444",
    "logo": null,
    "relation": "independent"
  },
  {
    "id": "jak-shield",
    "name": "JAK Shield",
    "bucket": "agentOps",
    "description": "Risk-based approval gate for AI agents — PII detection, sandboxed execution, and tamper-evident audit trails. Open-source and self-hostable.",
    "href": "https://github.com/inbharatai/jak-shield",
    "internal": false,
    "color": "#dc2626",
    "logo": null,
    "relation": "independent"
  },
  {
    "id": "agent-arcade",
    "name": "Agent Arcade",
    "bucket": "agentOps",
    "description": "Agent observability tooling with dashboard, session replay and cost analytics. Supported integrations and model pricing depend on the repository version.",
    "href": "https://github.com/inbharatai/agent-arcade-gateway",
    "internal": false,
    "color": "#4C8BF5",
    "logo": null,
    "relation": "independent"
  },
  {
    "id": "socialflow",
    "name": "SocialFlow",
    "bucket": "growth",
    "description": "AI social-media automation with local encrypted credential storage. Generation providers and publishing platforms receive the data required by the actions you configure; local storage does not mean all data stays on-device.",
    "href": "https://github.com/inbharatai/SocialFlow",
    "internal": false,
    "color": "#7C3AED",
    "logo": null,
    "relation": "independent"
  },
  {
    "id": "sahayaak-ai",
    "name": "Sahayaak AI",
    "bucket": "consumer",
    "description": "A personal AI workspace project for Indian users: chat, voice, document reading, translation, notes and information workflows. Language and feature availability depend on the build.",
    "href": "https://github.com/inbharatai/sahaayak-ai-public",
    "internal": false,
    "color": "#ff9933",
    "logo": null,
    "relation": "independent"
  },
  {
    "id": "kathakitaab",
    "name": "KathaKitaab",
    "bucket": "consumer",
    "description": "Living storybook platform — click to explore interactive scenes, watch characters breathe and react. Experience Indian epics like Ramayana as living books with three visual styles (photoreal, watercolour, animation) or cinematic films. Verb-aware AI animations and emotional Sarvam narration.",
    "href": "https://www.kathakitaab.com/",
    "internal": false,
    "color": "#f97316",
    "logo": null,
    "relation": "independent"
  },
  {
    "id": "unibot",
    "name": "UniBot",
    "bucket": "eduCareer",
    "description": "WhatsApp-oriented conversational support for student queries, admissions guidance and helpdesk workflows. Ask the team about access and the supported language set.",
    "href": "/#chatbot",
    "internal": false,
    "color": "#25D366",
    "logo": "/unibot-logo.png",
    "relation": "independent"
  },
  {
    "id": "phoring",
    "name": "Phoring",
    "bucket": "agentOps",
    "description": "Document → Knowledge Graph → Multi-Agent Simulation → Source-Cited Forecast. Upload documents, run OASIS social simulations on Twitter + Reddit, get predicted outcomes.",
    "href": "https://github.com/inbharatai/phoring",
    "internal": false,
    "color": "#10b981",
    "logo": "/phoring-logo.png",
    "relation": "independent"
  },
  {
    "id": "uniassist-ai",
    "name": "UniAssist.ai",
    "bucket": "eduCareer",
    "description": "AI-assisted international admissions planning, university matching and scholarship discovery. Guidance, not a guarantee of admission, immigration status or scholarships.",
    "href": "https://www.uniassist.ai",
    "internal": false,
    "color": "#3b82f6",
    "logo": "/uniassist-logo.png",
    "relation": "independent"
  },
  {
    "id": "testsprep-in",
    "name": "TestsPrep.in",
    "bucket": "eduCareer",
    "description": "AI exam preparation platform for focused pathways, practice tests, performance analytics, and adaptive learning outcomes across competitive and entrance examinations.",
    "href": "https://testsprep.in",
    "internal": false,
    "color": "#f43f5e",
    "logo": "/testsprep-logo.png",
    "relation": "independent"
  },
  {
    "id": "unoone",
    "name": "UnoOne",
    "bucket": "consumer",
    "description": "UnoOne is InBharat.ai’s local-first AI family: Power for Windows and Mobile for Android. Compatible local models, per-device memory and permission-controlled tools. Explore platform requirements, supported workflows and availability.",
    "href": "/unoone",
    "internal": true,
    "color": "#8b5cf6",
    "logo": null,
    "relation": "flagship"
  },
  {
    "id": "openclawfix",
    "name": "OpenClawFix",
    "bucket": "consumer",
    "description": "Setup tooling for OpenClaw via Docker, with gateway and AI-provider configuration. Setup time and compatibility depend on the host and selected provider.",
    "href": "https://openclawfix.pro",
    "internal": false,
    "color": "#14b8a6",
    "logo": "/openclawfix-logo.png",
    "relation": "independent"
  },
  {
    "id": "sahayaak-seva",
    "name": "Sahayaak Seva",
    "bucket": "health",
    "description": "Field-assistance project for Anganwadi workflows, including growth records, document reading and scheme lookup. Not a claim of government deployment or clinically validated diagnosis; access and validation are scoped per engagement.",
    "href": "https://sahayaakseva.in",
    "internal": false,
    "color": "#059669",
    "logo": null,
    "relation": "independent"
  },
  {
    "id": "swasthyascore-ai",
    "name": "SwasthyaScore AI",
    "bucket": "health",
    "description": "Personal health-screening project exploring questionnaires, camera-based vital estimation, lab-report reading and voice input. Not a medical diagnosis or validated replacement for clinical measurement.",
    "href": "https://swasthyascore-ai.vercel.app",
    "internal": false,
    "color": "#0ea5e9",
    "logo": null,
    "relation": "independent"
  }
] as const;
