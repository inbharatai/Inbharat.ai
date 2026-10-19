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
    name: 'Pocket AI — Historical Research',
    shortName: 'PAI',
    category: 'Foundational Deep Tech',
    tagline: 'Discontinued pen-drive product · historic research',
    description:
      'Historical research into a portable host-adaptive AI system with removable device-resident state. The pen-drive product has been discontinued; UnoOne Power and Mobile do not require removable-drive hardware.',
    patentStatus: 'Patent Pending',
    jurisdiction: 'India',
    applicationNo: '202631102427',
    patentTitle:
      'Portable Host-Adaptive Private Artificial Intelligence System with Device-Resident Canonical State',
    repository: 'https://github.com/inbharatai/PAI.V2',
    publicUrl: 'https://github.com/inbharatai/PAI.V2',
    route: '/pocket-ai',
    pillars: [
      'Device-resident canonical state',
      'Encrypted portable vault',
      'Host-adaptive runtime',
      'Offline-first AI',
      'Local model execution',
      'Cross-host continuity',
    ],
    limitations: [
      'Alpha state — not production-ready',
      'macOS build and runtime not yet tested',
      'Live voice, camera and TalkBack UX pending human validation',
      'No cloud dependency by design',
    ],
  },
] as const;

export const deepTechById = Object.fromEntries(
  DEEP_TECH_PROJECTS.map((project) => [project.id, project]),
) as Record<DeepTechProject['id'], DeepTechProject>;
