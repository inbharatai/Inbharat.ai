/** Public release contract. Source evidence is not release approval.
 * No development APK, source archive, or unsigned package belongs here.
 * Populate only after owner-approved signed artifacts and release acceptance.
 */
export type UnoOnePlatform = 'windows' | 'android';
export type ApprovedReleaseArtifact = {
  platform: UnoOnePlatform;
  approved: true;
  signed: true;
  version: string;
  url: string;
  sha256: string;
  bytes: number;
  approvedOn: string;
  signingIdentity: string;
  requirements: readonly string[];
  setupUrl: string;
  releaseNotesUrl: string;
  licenseUrl: string;
  supportUrl: string;
};
export type PlatformRelease = {
  id: UnoOnePlatform;
  name: string;
  platform: string;
  href: string;
  purpose: string;
  artifact: ApprovedReleaseArtifact | null;
  requirements: readonly string[];
  setup: readonly string[];
};

const publicHttps = (value: unknown): boolean => {
  if (typeof value !== 'string' || !value.trim()) return false;
  try {
    const url = new URL(value);
    // Release metadata uses named public HTTPS destinations, never IP literals
    // or local/development names. DNS reachability/ownership is a release check,
    // not something this browser-safe configuration validator can establish.
    const host = url.hostname.toLowerCase().replace(/\.$/, '');
    return url.protocol === 'https:' && !url.username && !url.password &&
      host.includes('.') && !host.startsWith('[') &&
      !/^\d+(?:\.\d+){3}$/.test(host) &&
      !/(?:^|\.)(?:localhost|local|internal|invalid|test)$/.test(host);
  } catch { return false; }
};
/** Fail closed even if configuration is provided from untyped build tooling.
 * This checks completeness, not cryptographic signing or release qualification.
 */
export function approvedArtifact(release: PlatformRelease): ApprovedReleaseArtifact | null {
  const artifact = release.artifact;
  if (!artifact || artifact.platform !== release.id || artifact.approved !== true || artifact.signed !== true) return null;
  if (typeof artifact.version !== 'string' || !artifact.version.trim() || typeof artifact.signingIdentity !== 'string' || !artifact.signingIdentity.trim()) return null;
  if (typeof artifact.sha256 !== 'string' || !/^[a-f0-9]{64}$/i.test(artifact.sha256)) return null;
  if (!Number.isSafeInteger(artifact.bytes) || artifact.bytes <= 0 || typeof artifact.approvedOn !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(artifact.approvedOn)) return null;
  const approvalTime = Date.parse(artifact.approvedOn + 'T00:00:00Z');
  if (!Number.isFinite(approvalTime) || new Date(approvalTime).toISOString().slice(0, 10) !== artifact.approvedOn) return null;
  if (!Array.isArray(artifact.requirements) || !artifact.requirements.length || artifact.requirements.some(requirement => typeof requirement !== 'string' || !requirement.trim())) return null;
  if (![artifact.url, artifact.setupUrl, artifact.releaseNotesUrl, artifact.licenseUrl, artifact.supportUrl].every(publicHttps)) return null;
  return artifact;
}

export const UNOONE_RELEASES: readonly PlatformRelease[] = [
  {
    id: 'windows', name: 'UnoOne Power', platform: 'Windows', href: '/unoone/power',
    purpose: 'A workspace for research, documents, granted files and reviewable coding work.',
    artifact: null,
    requirements: [
      'A qualified Windows configuration and compatible local model. Exact supported OS, RAM, GPU and storage requirements will accompany an approved installer.',
      'Model weights and context consume memory. Admission checks can refuse a configuration that does not fit; large-model experiments are not minimum-system recommendations.',
      'Network access for initial assets, live research and any connected services you choose. Supported local inference and memory do not require a cloud-model API.',
    ],
    setup: [
      'Confirm your Windows version, RAM, GPU and intended tasks with the team before arranging access.',
      'Use the approved package and its published checksum when available; review installation, upgrade and data-preservation guidance.',
      'Install a compatible model, select a context budget and grant only the folders and tools needed for your first task.',
      'Start with a small document or coding task. Review the recorded outcome before expanding permissions or connecting an online service.',
    ],
  },
  {
    id: 'android', name: 'UnoOne Mobile', platform: 'Android', href: '/unoone/mobile',
    purpose: 'Local intelligence, practical native phone tools and reviewed connected workflows.',
    artifact: null,
    requirements: [
      'The reviewed source declares Android 9+ and arm64. That is a source floor, not a tested-device promise; the final supported phone/model matrix is not published yet.',
      'Compatible local models require separate assets and sufficient memory. Supported native actions and Blind Aid do not require a loaded conversational model.',
      'Speech needs an available supported pack or device-local recognition. The Android on-device fallback requires Android 12+ and device support; a language selector is not a downloadable speech pack.',
      'The reviewed release configuration disables cross-app Accessibility automation and Owl planning. Do not enable development-only permissions to follow old footage.',
    ],
    setup: [
      'Share your phone model, Android version and the tasks or speech language you need when asking about availability.',
      'Wait for the approved distribution and verified setup guide. The supplied development APKs are not public releases, and no Play listing is claimed.',
      'Choose compatible model and speech assets for your device. Grant camera, microphone or other permissions only for the features you choose.',
      'Try a native note or draft handoff first. Review connected actions separately; a saved reminder is not proof of notification delivery.',
    ],
  },
];
export const releaseAvailability = (release: PlatformRelease): string => approvedArtifact(release)
  ? `Approved ${release.platform} package available`
  : 'Public package awaiting approval';

export const LAUNCH_PAGES = {
  '/get-started': {
    eyebrow: 'GET UNOONE', title: 'Choose your workspace.',
    description: 'Explore UnoOne Power for Windows or UnoOne Mobile for Android. Check models, setup and requirements, then ask the team about availability. Public downloads appear here only when final signed releases are approved.',
  },
  '/status': {
    eyebrow: 'STATUS & COMPATIBILITY', title: 'Clear evidence. Clear boundaries.',
    description: 'A dated guide to UnoOne implementation, qualification and public availability. This is a product evidence ledger, not live uptime monitoring or an independent certification.',
  },
  '/ecosystem': {
    eyebrow: 'INBHARAT.AI ECOSYSTEM', title: 'One company. Distinct products.',
    description: 'Explore all 15 InBharat.ai product entries across six groups. UnoOne is the flagship; other services have their own purpose, access, data policies and release status. Portfolio membership does not imply UnoOne integration or shared memory.',
  },
  '/unoone/demo': {
    eyebrow: 'THE UNOONE WALKTHROUGH', title: 'See the workspace in action.',
    description: 'Watch the complete 2-minute 22-second UnoOne walkthrough, with captions, chapters and a readable transcript. These October 2026 Windows and Android captures are historical product footage, not a demonstration of a final public release.',
  },
} as const;
export type LaunchPath = keyof typeof LAUNCH_PAGES;

export const UNOONE_STATUS = {
  reviewedOn: '2026-11-16',
  reviewLabel: 'Reviewed 16 November 2026',
  sourceNote: 'Based on the founder-authored Power engineering preprint dated 14 November 2026 and a read-only Mobile source/evidence review including 14–16 November notes. Reports and source inspection are not an independent security audit or fresh execution of the supplied software.',
  rows: [
    { name: 'Power · Windows work', state: 'Implemented; wider qualification pending', detail: 'Internal evidence covers files, supported documents, coding, model admission and bounded tools. It does not establish every Windows configuration, general vision acceptance or long-term background reliability.' },
    { name: 'Mobile · local intelligence and native tools', state: 'Source-reviewed; final device matrix pending', detail: 'Native actions and Blind Aid are independent of a loaded conversational LLM. Limited developer/owner phone observations exist; current-source, full-artifact end-to-end acceptance remains incomplete.' },
    { name: 'Mobile · shipping configuration', state: 'Restricted release configuration', detail: 'The inspected release configuration disables cross-app Accessibility automation and Owl planning. Source or development footage is not proof of what an approved shipping build will enable.' },
    { name: 'Connected work', state: 'Permission- and provider-specific', detail: 'Web research uses the network. Ordinary email/WhatsApp routes open drafts; separate native provider code supports explicitly reviewed operations. Account configuration is not proof of live-provider qualification.' },
    { name: 'Speech and documents', state: 'Supported assets and formats only', detail: 'Speech depends on installed packs and device-local recognition. Android document reading and save-as-copy form/template filling have their own bounds; Windows evidence does not qualify Android results.' },
    { name: 'Phone–computer continuity', state: 'In development', detail: 'Each device retains its own local state. Pairing design and tests do not establish a qualified physical round trip, manual or automatic.' },
    { name: 'Learning and memory', state: 'Persistent records, not self-retraining', detail: 'Memory is separate from model weights and retrieval is bounded. Experimental Windows training ran, but both reported candidate adapters were rejected; automatic quality-improving retraining is not offered.' },
    { name: 'Finance', state: 'Read-only product policy', detail: 'No payment, transfer or trade automation. This policy is not an independently proven universal enforcement guarantee or a promise of financial-account coverage.' },
  ],
  releaseGates: [
    'Owner-approved signed artifacts, exact versions, full checksums and source-to-build identity.',
    'Clean installation, safe upgrades and data-preservation checks on the declared device/platform matrix.',
    'Current-build acceptance of advertised workflows, permissions, offline/network behavior and interruption/recovery.',
    'Approved distribution, requirements, model/speech setup, license, support scope and current-release media.',
  ],
} as const;
