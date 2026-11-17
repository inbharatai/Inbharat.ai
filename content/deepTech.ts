export type PatentPendingStatus = 'Patent Pending';

export type DeepTechProject = {
  id: 'silt' | 'pai';
  name: string;
  shortName: string;
  category: 'Foundational Deep Tech' | 'Historical Research';
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
    name: 'Pocket AI research',
    shortName: 'Historical PAI',
    category: 'Historical Research',
    tagline: 'The earlier portable-intelligence architecture',
    description:
      'The earlier Pocket AI research explored host-adaptive execution with a removable drive holding canonical encrypted state. It is preserved as historical research and a recorded Indian patent-pending filing—not a current removable-drive consumer offer. UnoOne is the current product brand. The historical filing does not establish patent coverage of every current UnoOne feature.',
    patentStatus: 'Patent Pending',
    jurisdiction: 'India',
    applicationNo: '202631102427',
    patentTitle:
      'Portable Host-Adaptive Private Artificial Intelligence System with Device-Resident Canonical State',
    repository: 'https://github.com/inbharatai/PAI.V2',
    publicUrl: '/technology',
    route: '/technology',
    pillars: [
      'Historical portable architecture',
      'Host-adaptive execution',
      'Encrypted canonical state',
      'Recorded filing, not certification',
      'Separate from current product readiness',
    ],
    limitations: [
      'Development-stage software — internal scoped tests, not release-qualified',
      'Cross-device continuity is in development (pairing unit-tested; physical round trip not qualified)',
      'The removable-drive formulation in the patent filing is retired as a marketed product',
      'No claims of autonomous self-improvement or AGI; historical filing does not establish coverage of every current feature',
    ],
  },
] as const;

export const deepTechById = Object.fromEntries(
  DEEP_TECH_PROJECTS.map((project) => [project.id, project]),
) as Record<DeepTechProject['id'], DeepTechProject>;
