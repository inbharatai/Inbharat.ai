export type PatentPendingStatus = 'Patent Pending';

export type DeepTechProject = {
  id: 'silt' | 'pai';
  name: string;
  shortName: string;
  category: 'Foundational Deep Tech';
  tagline: string;
  description: string;
  patentStatus: PatentPendingStatus;
  jurisdiction: 'India';
  applicationNo: string;
  filingDate?: string;
  patentTitle?: string;
  repository: string;
  publicUrl: string;
  route: string;
  pillars: string[];
  limitations?: string[];
};

export const DEEP_TECH_PROJECTS: readonly DeepTechProject[] = [
  {
    id: 'silt',
    name: 'SILT',
    shortName: 'SILT',
    category: 'Foundational Deep Tech',
    tagline: 'The Trust Gate for AI Learning',
    description:
      'Skill Interchange Layer with Trust-gating. A local-first system for representing and transferring narrow AI capabilities, measuring their benefit on held-out cases, and enforcing admission, safety and rollback rules. Default packet transfer leaves receiver weights unchanged; optional adaptation and compression require their own validation.',
    patentStatus: 'Patent Pending',
    jurisdiction: 'India',
    applicationNo: '202631101454',
    filingDate: '2026-08-21',
    patentTitle:
      'Trust-Gated Skill Packet Transfer and Hardware-Aware Adaptation Across Heterogeneous Artificial Intelligence Systems',
    repository: 'https://github.com/inbharatai/SILT',
    publicUrl: 'https://silt.inbharat.ai',
    route: '/silt',
    pillars: [
      'Trust-gated skill transfer',
      'Held-out admission testing',
      'All-or-nothing promotion gate',
      'Human sign-off for high-risk domains',
      'Tamper-evident audit',
      'Per-skill rollback',
      'Hardware-aware adaptation',
      'Per-skill compression certification',
    ],
    limitations: [
      'No teacher-weight copying in core packet transfer',
      'No claim of autonomous self-improvement or AGI',
      'Current local HMAC evidence is not portable third-party attestation',
    ],
  },
  {
    id: 'pai',
    name: 'PAI',
    shortName: 'PAI',
    category: 'Foundational Deep Tech',
    tagline: 'One Personal Private AI Agent',
    description:
      'PAI (pronounced "Pi") is one personal private AI agent: a persistent, permission-controlled assistant implemented through the UnoOne ecosystem — UnoOne Power for desktop and UnoOne Mobile for Android — with local models, permission-controlled tool execution and encrypted personal memory that survives model changes. Its architecture began as a portable host-adaptive design whose removable drive held the canonical state (the host computes, the drive remains the authoritative store) — preserved as historical prior research, not a marketed product.',
    patentStatus: 'Patent Pending',
    jurisdiction: 'India',
    applicationNo: '202631102427',
    patentTitle:
      'Portable Host-Adaptive Private Artificial Intelligence System with Device-Resident Canonical State',
    repository: 'https://github.com/inbharatai/PAI.V2',
    publicUrl: 'https://www.inbharat.ai/private-ai',
    route: '/private-ai',
    pillars: [
      'Private memory independent of the model',
      'Permission-controlled tool execution',
      'Local model execution with memory budgets',
      'Drafts-never-sends on the phone',
      'Action verification with receipts',
      'Offline-first design',
    ],
    limitations: [
      'Development-stage software — verified builds, not release-qualified',
      'Cross-device continuity is in development (manual pairing designed)',
      'The removable-drive formulation in the patent filing is retired as a marketed product',
      'No claims of autonomous self-improvement',
    ],
  },
] as const;

export const deepTechById = Object.fromEntries(
  DEEP_TECH_PROJECTS.map((project) => [project.id, project]),
) as Record<DeepTechProject['id'], DeepTechProject>;
