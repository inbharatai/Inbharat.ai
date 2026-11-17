/** Shared public positioning. Implementation evidence is distinct from final
 * release approval; see unooneRelease.ts for the only public artifact gate. */
import { UNOONE_RELEASES, releaseAvailability } from './unooneRelease';

export const UNOONE_LANDING = {
  brand: 'UnoOne',
  byline: 'by InBharat.ai',
  familyIntro: 'Choose Power for Windows work or Mobile for practical Android assistance. Each device has its own local store; phone–computer continuity remains in development.',
  headline: ['Models change.', 'Your work stays yours.'],
  definition: 'UnoOne brings compatible local AI models, encrypted memory and permission-controlled tools into one workspace for research, documents and coding.',
  networkBoundary: 'Core inference and memory are local-first. Web research and connected services use the network.',
  evidenceNote: 'Evidence reviewed 16 November 2026. Implementation, device qualification and approved public availability are different stages. See Status for the current scope.',
  statuses: [
    ...UNOONE_RELEASES.map(release => ({ name: release.name, platform: release.platform, status: releaseAvailability(release), detail: release.purpose })),
    { name: 'Phone–computer continuity', platform: 'Cross-device', status: 'In development', detail: 'Each device retains its own local state. A physical round trip is not yet qualified, manual or automatic.' },
  ],
  workflows: [
    { title: 'Turn files into useful work', text: 'Read supported documents, organize granted folders and prepare reviewable coding changes.', boundary: 'Supported formats, platform capabilities and permissions apply.' },
    { title: 'Keep memory beyond one model', text: 'Retain approved knowledge and conversation records in an encrypted local vault, separate from model weights.', boundary: 'Same-device persistence and bounded retrieval—not unlimited recall or automatic sync.' },
    { title: 'Research with explicit boundaries', text: 'Use permitted browser and research workflows, with source information and outcome checks where supported.', boundary: 'Live research and connected services use the network.' },
    { title: 'Build reusable specialists', text: 'Save instructions and allowed tools for specialist agents, then inspect their recorded work.', boundary: 'Power uses a shared local runtime—not a virtual machine per agent or a qualified swarm.' },
  ],
  faqs: [
    { q: 'What is UnoOne?', a: 'UnoOne is InBharat.ai’s local-first AI software family. Power combines compatible local models, encrypted memory and permission-controlled tools for Windows work. Mobile brings local intelligence and practical native tools to Android; each platform has its own qualification and availability.' },
    { q: 'How can I get UnoOne?', a: 'Choose Windows or Android on Get UnoOne to review requirements and ask the team about availability. Final approved signed installers and public download URLs have not been supplied. Development APKs and source archives are not offered as public releases.' },
    { q: 'Does UnoOne work offline?', a: 'Supported local inference, stored memory and local file work do not require a cloud-model API. Initial model or speech assets may need downloading. Live research, website actions and connected services need network access.' },
    { q: 'What stays mine when I change models?', a: 'Memory and approved knowledge live in the agent layer rather than model weights. Same-device records can persist across model changes and restarts, but retrieved context is bounded. Phone–computer continuity is still in development, not automatic sync.' },
    { q: 'Which models and devices can it use?', a: 'Compatible local models must meet architecture, feature, context and available-memory checks. A successful run on one device does not qualify every model or device. Speech also depends on supported packs and device-local recognition; consult the platform setup and status pages.' },
    { q: 'Can Mobile control every app?', a: 'No. Supported native functions and Blind Aid can work without a loaded conversational model, while reviewed connected workflows have separate permissions. The inspected release configuration disables cross-app Accessibility automation and Owl planning. Finance is read-only by product policy; no payment, transfer or trade automation is offered.' },
    { q: 'Does it train itself from my conversations?', a: 'No. Saved conversations and knowledge do not automatically change model weights. Experimental offline training requires separate consent and evaluation; the reported candidate adapters did not pass the full quality gate.' },
    { q: 'What happened to PAI?', a: 'UnoOne is the current product brand. PAI remains in explanatory and historical research context, including the earlier Pocket AI portable-architecture filing. That research is not a competing product or proof that every UnoOne feature is covered by the filing.' },
  ],
} as const;

export const UNOONE_DEMO = {
  title: 'UnoOne product walkthrough',
  visibleContext: 'Historical Windows and Android captures · October 2026. Compare with current platform status before choosing a workflow.',
  description: 'Team-supplied walkthrough using October 2026 Windows and Android captures: local memory, model management and reviewed actions. Internal measurements and future plans in this historical film are not final-release guarantees. Current evidence was reviewed 16 November 2026, including the 14 November Power preprint and Mobile source review.',
  video: '/unoone/unoone-demo.mp4',
  poster: '/unoone/unoone-demo-poster.jpg',
  captions: '/unoone/unoone-demo-en.vtt',
  duration: 'PT2M22S',
  durationLabel: '2 min 22 sec',
  bytes: 8700308,
  chapters: [
    { label: 'Your local workspace', seconds: 15 },
    { label: 'Connected context · online', seconds: 31 },
    { label: 'Models and hardware', seconds: 38 },
    { label: 'Android and Blind Aid', seconds: 75 },
    { label: 'Reviewed actions', seconds: 102 },
    { label: 'What is still ahead', seconds: 126 },
  ],
} as const;
