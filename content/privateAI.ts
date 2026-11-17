/** Shared UnoOne platform and technology copy. Source-implemented capabilities
 * are not final-artifact release approval or independent device qualification.
 * The November Mobile review supersedes historical blanket automation claims.
 */
export type Readiness = 'working' | 'in-development' | 'planned' | 'research' | 'historical';
export type Capability = {
  name: string;
  what: string;
  readiness: Readiness;
  evidence?: string;
};
export type PrivateAiPage = {
  path: string;
  eyebrow: string;
  h1: string;
  description: string;
  status: string;
  audience: string;
  audienceTitle?: string;
  capabilitiesHeading?: string;
  capabilities: Capability[];
  sections: { title: string; body: string }[];
  faqs: { q: string; a: string }[];
};

export const PAI_STATUS_POWER = 'Windows development build. Founder-reported internal engineering evidence through 14 November 2026; broader release qualification remains ahead.';
export const PAI_STATUS_MOBILE =
  'Android source reviewed 16 November 2026. Limited owner/developer phone observations exist; full current-build device and workflow qualification remains incomplete.';
export const PAI_STATUS_SYNC =
  'In development: manual, consent-based pairing is designed and unit-tested; no physical phone–desktop round trip is yet qualified, manual or automatic.';
export const PAI_STATUS_PLATFORM =
  'UnoOne is the current product brand. Discuss pilot access with the team; a general public release is not established by the supplied engineering evidence.';

export const PRIVATE_AI_REVIEWED_ON = '2026-11-16';
export const PRIVATE_AI_EVIDENCE_SCOPE = 'Content reviewed 16 November 2026. Evidence below is scoped internal engineering reporting, including the founder-authored UnoOne Power preprint dated 14 November 2026, not independent certification or release qualification. Unit tests, implemented surfaces and earlier device runs do not establish current end-to-end readiness. The Mobile review includes 14–16 November development notes and source restrictions. Final signed artifacts, a supported-device matrix and qualified speech-pack coverage remain pending.';
export const READINESS_LABELS: Record<Readiness, string> = {
  working: 'Implemented',
  'in-development': 'In development',
  planned: 'Planned',
  research: 'Research',
  historical: 'Historical',
};

export const UNOONE_PAGES: readonly PrivateAiPage[] = [
  {
    path: '/private-ai',
    eyebrow: 'UnoOne — Personal Private AI',
    h1: 'Your workspace. Your permissions.',
    description:
      'UnoOne is InBharat.ai’s local-first personal AI software family. UnoOne Power combines compatible local models, encrypted memory and permission-controlled tools on Windows; UnoOne Mobile brings local intelligence and practical native tools to Android. This page explains the private-agent approach and its limits.',
    status: 'Local-first is a data-flow design, not a promise that connected actions stay offline. Availability and current evidence are listed on Status.',
    audience:
      'Read this page for the principles behind UnoOne; visit Power and Mobile for platform-specific capabilities, evidence and readiness.',
    capabilities: [
      { name: 'Agent, not chatbot', what: 'UnoOne is a persistent experience — it holds task state, carries context between sessions, and acts through tools rather than only answering in a chat window.', readiness: 'working', evidence: 'Task surfaces, memory and tool lanes implemented in the UnoOne builds.' },
      { name: 'Personal', what: 'Device-local memory, permissions and history persist beyond an individual model session. Continuity across devices is a separate, unfinished capability.', readiness: 'working', evidence: 'Vault identity layers bind state to an encrypted personal identity in both builds.' },
      { name: 'Permission-controlled', what: 'Tools use platform-specific permission and review gates. Grant only needed resources; finance stays read-only by product policy, with no payment, transfer or trade automation.', readiness: 'working', evidence: 'Desktop granted-folder fences and approval cards; Android source-level risk tiers and restricted release configuration. This is not independent proof of universal enforcement.' },
      { name: 'Evidence for supported outcomes', what: 'Objective checks can distinguish supported verified outcomes from a model’s claim. Some tasks remain unverified; generated answers are not guaranteed true.', readiness: 'working', evidence: 'Per-tool receipts and outcome checks across file, document, browser and connector lanes.' },
      { name: 'Model-independent memory', what: 'Memory is held outside the model in an encrypted agent-layer store, so context survives model switching, reloading and restarts on the same device.', readiness: 'working', evidence: 'Restores across restarts and model switches; memory explorer visible in the desktop build.' },
      { name: 'Local by default', what: 'Supported core inference and memory run locally. Online research, provider connections, exports and configured mirroring have separate data flows.', readiness: 'working', evidence: 'Desktop runs local inference in a pinned session context; Android planning runs on-device (LiteRT-LM).' },
      { name: 'Cross-device continuity', what: 'Phone–computer continuity is being developed around explicit consent; each device retains its own local store.', readiness: 'in-development', evidence: 'Pairing and ledger design unit-tested; the physical round trip is not yet qualified.' },
    ],
    sections: [
      {
        title: 'A permissioned task loop',
        body: 'Understand → Plan → Authorise → Act → Verify. The agent forms an interpretation of the request, produces a bounded plan, asks for authorisation wherever a permission applies, executes through permitted tools on the device that owns the task, and checks supported outcomes against recorded evidence, distinguishing verified from unverified results.',
      },
      {
        title: 'Boundaries as product features',
        body: 'Ordinary email/WhatsApp handoffs open drafts for review; separate native provider paths can commit specifically reviewed operations. Credentials and final external actions have platform-specific controls. Model admission checks and permission code bound supported paths; they are not an independent all-path security guarantee.',
      },
      {
        title: 'Where UnoOne is implemented today',
        body: 'Power has internal implementation evidence for files, documents, browser, connectors and coding. Mobile has native tools, local model paths and reviewed workflows with different device and distribution limits. See the platform guides and Status for current qualification.',
      },
    ],
    faqs: [
      {
        q: 'How does PAI relate to UnoOne?',
        a: 'UnoOne is the current product name. PAI remains part of the private-agent explanation and earlier Pocket AI research history, not a competing consumer product. The historical portable-architecture filing is recorded as Indian application 202631102427. The software family comprises UnoOne Power (Windows) and UnoOne Mobile (Android); the removable-drive formulation is historical research, not a consumer offer or a claim that every current feature is covered by that filing.',
      },
      {
        q: 'Is UnoOne available as a public download?',
        a: 'Not as a public download. It is implemented in the UnoOne development builds that are being verified for release; pilot access is discussed with the team. The InBharat AI web console is a separate browser product, not an installer or hosted version of UnoOne.',
      },
      {
        q: 'How is UnoOne private if it connects to websites and mail?',
        a: 'Personal memory is stored encrypted on each device and core inference is local. Optional web searches, mail connectors, website navigation and confirmed form submissions or uploads can transmit queries, requests, form fields or selected files to external services. Website sessions use their normal authentication traffic; the agent does not type passwords. Permissions bound these actions, but local storage is not a promise that all network traffic stays on-device.',
      },
    ],
  },
  {
    path: '/unoone',
    eyebrow: 'UnoOne',
    h1: 'Choose the way you work.',
    description:
      'UnoOne is InBharat.ai’s personal private AI software family: UnoOne Power for Windows desktop and laptop, and UnoOne Mobile for Android. The model can change; the personal experience stays yours.',
    status: 'Power and Mobile have separate capabilities, local stores and release qualification. Approved public packages are not yet listed.',
    audience:
      'UnoOne is for people who want a capable AI assistant without handing every task, file and conversation to a cloud account — and for teams who want the same discipline in an organisation. Read each product page for what is working today versus what is being built, and contact us about early-access pilots.',
    capabilities: [
      { name: 'One agent identity', what: 'The same personal agent concept lives on desktop and Android; a logical personal identity is kept per device.', readiness: 'working', evidence: 'Local builds carry per-device vault identity; pairing layers unit-tested in CI.' },
      { name: 'Local model execution', what: 'Inference runs on your hardware. Model selection adapts to the machine’s available memory instead of assuming a data-centre budget.', readiness: 'working', evidence: 'RAM-aware admission test suites pass; measured load/unload diagnostics on the desktop build.' },
      { name: 'Permission-controlled tools', what: 'Supported file, browser, command and connected-service tools use platform-specific permission gates and review steps. Capabilities differ between Power and the restricted Mobile release configuration.', readiness: 'working', evidence: 'Granted-folder fence + approval cards verified in live UI sessions on the desktop build.' },
      { name: 'Persistent personal memory', what: 'Conversation turns and task context are stored by the agent layer, encrypted, and restored across restarts — independent of which model is active.', readiness: 'working', evidence: 'Chat memory restores the last 30 turns across restarts; memory explorer shows the store.' },
      { name: 'Action verification', what: 'Bounded actions are checked against their intended outcome, with receipts, instead of trusting the model’s self-report.', readiness: 'working', evidence: 'Executed with honest outcomes in live desktop sessions for file, doc, browser and connector tools.' },
      { name: 'Cross-device continuity (phone ↔ desktop)', what: 'Context and task transfer is being developed around a manual, consent-based pairing protocol with unit tests; no physical two-device workflow is qualified yet.', readiness: 'in-development', evidence: 'UNIFIED_SYNC_V2 ledger and pairing lanes have unit tests; no physical round trip yet.' },
    ],
    sections: [
      {
        title: 'Two products, one experience',
        body: 'Choose Power for research, granted files, documents and coding on Windows. Choose Mobile for compatible on-device AI, practical native tools, local organization and reviewed connected workflows on Android. The variants do not have feature parity or an automatically shared vault.',
      },
      {
        title: 'Model-independent memory',
        body: 'The personal layer is implemented outside the model: encrypted records, an identity and journal that survive model switches. The active model can change as your hardware changes; your context is the asset that persists.',
      },
      {
        title: 'Local-first with optional connection',
        body: 'Core experience is designed to run on your own hardware. Optional capabilities — e-mail sweeps through a connector you configure, website connections you log into, notification intake on Android — exist while keeping the personal-agent experience usable offline. Cloud services are not the foundation of the experience.',
      },
    ],
    faqs: [
      {
        q: 'What is UnoOne?',
        a: 'UnoOne is InBharat.ai’s software ecosystem for PAI, one personal private AI agent. It is being developed as UnoOne Power (Windows) and UnoOne Mobile (Android). Each has its own encrypted local store; phone–desktop continuity is not yet qualified end to end.',
      },
      {
        q: 'How is this different from a local chatbot?',
        a: 'A local chatbot runs a model in a window. UnoOne is being built as a personal AI operating layer: it holds task state, files, permissions and memory; uses permitted tools; and verifies outcomes — the model is one component the layer can swap.',
      },
      {
        q: 'Does my data go to the cloud?',
        a: 'The design is local-first: conversation memory and records are stored encrypted on your own device by the agent layer. Optional mail connectors, web searches, browser navigation, confirmed form submissions and uploads can send requests, queries, fields or selected files to external services. Each requires the relevant permission; local inference and storage do not make these network actions offline.',
      },
      {
        q: 'Does cross-device sync work today?',
        a: 'Not as an automatic pipeline. A manual, consent-based pairing design exists with unit tests on both sides, and a physical phone–desktop round trip is not yet qualified — until then we treat sync as in development, not shipped.',
      },
      {
        q: 'How can I try it?',
        a: 'UnoOne is being validated for release, so access is via early-access and pilot conversations — contact us through the contact page. The separate AI console has its own configuration and account availability; it is not a hosted UnoOne session.',
      },
    ],
  },
  {
    path: '/unoone/power',
    eyebrow: 'UnoOne Power',
    h1: 'Bring useful AI work to Windows.',
    description:
      'UnoOne Power is a local-first AI workspace and permission-controlled agent runtime for Windows. It combines compatible local models, encrypted memory, documents, coding, research and reusable specialists, with evidence checks for supported outcomes.',
    status: PAI_STATUS_POWER,
    audience:
      'UnoOne Power is designed for people who work with real files, real browsers and real deadlines — developers, researchers, founders and busy professionals — and want an assistant that operates on their own computer instead of uploading their working life.',
    capabilities: [
      { name: 'Hardware-aware execution', what: 'The assistant checks available system RAM and GPU/VRAM, then admits a local model configuration that fits — refusing to load when the budget is not met (fail closed).', readiness: 'working', evidence: 'Admission policy with budget math is unit-tested; measured load/unload results on the test system.' },
      { name: 'Model routing and switching', what: 'Choose compatible models and context budgets, then load, stop or switch verified artifacts. Large-model experiments are hardware-dependent; the latest reported 27B test encountered critical pressure and unloaded before a user turn.', readiness: 'working', evidence: 'Founder preprint, pp.8–10: internal model-admission and lifecycle checks. Earlier 27B hybrid results are not a stable daily-performance or minimum-hardware guarantee.' },
      { name: 'Personal memory', what: 'Conversation records and approved knowledge are held in encrypted local storage, separate from model weights. Restored and retrieved context is bounded, not unlimited recall.', readiness: 'working', evidence: 'Restores last 30 turns with an honest banner; memory search works across restarts.' },
      { name: 'Coding workflows', what: 'A fenced workspace with diff/patch preview, task worktrees, budgets and cancellation so code changes stay reviewable.', readiness: 'working', evidence: 'Coding lanes implemented and exercised in verification runs; confirmation gate remains on for safety.' },
      { name: 'Files and documents', what: 'Reading, writing, copying and searching files, plus creating real PDF, DOCX, MD and TXT documents — inside folders the user has granted.', readiness: 'working', evidence: 'Byte-exact fs operations and document writers verified in gates and live runs.' },
      { name: 'Browser operations', what: 'Typed browser actions (navigate, click, type, extract, screenshot) with scheme allowlists — no arbitrary script injection — and login state that persists across restarts in the shared browser engine.', readiness: 'working', evidence: 'Browser policy tests green; popup sign-in flows live-verified.' },
      { name: 'Website connections', what: 'The agent recognises login state on site profiles it has been granted (strong/weak/none → honest states) and asks before acting — it never types your credentials.', readiness: 'working', evidence: 'Login-evidence engine with receipts, vault-bound registry, never-types-credentials rule.' },
      { name: 'Web research', what: 'Research modes gather sources, and e-mail sweeps can surface unread items through a connector you configure.', readiness: 'working', evidence: 'Founder preprint, pp.12,17–18: source/date checks and read-only awareness are described. This does not establish universal citation completeness or website compatibility.' },
      { name: 'Local OCR and document text', what: 'Read supported PDF text layers and use Windows OCR for supported scans and images. Unsupported encodings and formats can be refused or incomplete.', readiness: 'working', evidence: 'Founder preprint, p.18: bounded parser and Windows OCR paths. No universal document accuracy claim.' },
      { name: 'General vision compatibility', what: 'Image attachment and projector handling is implemented, but general acceptance of live vision-capable model artifacts remains under validation.', readiness: 'in-development', evidence: 'Founder preprint, pp.18,29: text-model results do not qualify general visual understanding.' },
      { name: 'Form workflows', what: 'Assisted form completion inside the browser engine with confirmation for submit/upload/download actions.', readiness: 'working', evidence: 'Confirmation-gated actions per browser policy; verified in browser acceptance runs.' },
      { name: 'Offline voice interaction', what: 'Local speech recognition and synthesis for supported assets and hardware. An installed language pack and a qualified speech path are different from a language shown in a selector.', readiness: 'working', evidence: 'Internal engineering report: 19/19 checks in a desktop speech matrix. A public language-by-modality list, build/date and hardware record are still needed; this is not a claim of universal language or device coverage.' },
      { name: 'Read-only background awareness', what: 'Configured watchers, daily reviews, approval cards and a draft-to-clipboard workflow help organize permitted sources without autonomous background sending.', readiness: 'working', evidence: 'Founder preprint, p.17: implemented Windows development surfaces; long-term reliability and broad field usability are not established.' },
      { name: 'Reusable specialist agents', what: 'Save instructions and allowed tools in a vault-bound registry, then run specialists with bounded context, budgets and outcome checks.', readiness: 'working', evidence: 'Founder preprint, pp.14–16: internal child-run evidence; shared OS/model runtime, serialized inference, not a separate VM or qualified swarm scheduler.' },
      { name: 'Approved knowledge and experimental training', what: 'Saved knowledge and corrections remain separate from model weights. Optional offline adaptation requires separate consent and a quality decision gate.', readiness: 'research', evidence: 'Founder preprint, pp.19–21: training cycles executed, but both reported candidate adapters were rejected. No quality-improving production adapter is claimed.' },
    ],
    sections: [
      {
        title: 'Understand → Plan → Authorise → Act → Verify',
        body: 'The harness plans bounded work, requests permission where required and records tool outcomes. Objective verifiers can check supported file, document or browser tasks; the system distinguishes verified results from completion claims rather than promising every generated answer is correct.',
      },
      {
        title: 'Memory budgets measured, not guessed',
        body: 'Local models are admitted by a memory budget that counts weights, projector, context cache and headroom against the machine’s capacity — and can refuse a configuration that does not fit. Broader stability remains under validation: the latest reported boot soak included a first-boot stall, and large-model experiments encountered host pressure.',
      },
      {
        title: 'Status, honestly',
        body: 'Power is development-stage software with verification runs on a single test environment. System requirements depend on your machine’s RAM and GPU. Some features remain actively being finished — long-term background reliability, a long-recording summarizer, and macOS packaging remain unqualified. We will not advertise downloads until the release audience is properly qualified.',
      },
    ],
    faqs: [
      {
        q: 'Can UnoOne Power work offline?',
        a: 'The core paths — local model inference, memories, files, documents, coding workspace, offline speech — are designed to run without cloud services. Live web research and connector sweeps are optional online capabilities.',
      },
      {
        q: 'Which models can it run?',
        a: 'It runs compatible GGUF models from your configured model folder, subject to architecture, modality, tool-use and available-memory validation. Model artefacts are hash-verified before load. The experience is built so switching models does not switch away from your personal context.',
      },
      {
        q: 'Does the agent control my PC?',
        a: 'Only through explicit permission. Folders are granted individually, commands run in bounded processes with owner receipts, browser actions are typed and allowlisted, and anything ungranted raises an approval card.',
      },
      {
        q: 'Is there an installer I can download today?',
        a: 'Not yet — the current builds are development-stage and we will not publish an installer until the release package is qualified. Early-access and pilot conversations are already open.',
      },
    ],
  },
  {
    path: '/unoone/mobile',
    eyebrow: 'UnoOne Mobile · Android',
    h1: 'Local intelligence. Practical phone tools.',
    description: 'UnoOne Mobile brings compatible on-device AI, useful native actions, local organization and reviewed connected workflows to Android. Use supported phone tools without making a language model responsible for every action.',
    status: PAI_STATUS_MOBILE,
    audience: 'Choose Mobile for notes, reviewable draft handoffs, assistive camera cues and supported local AI on your phone. Device, model, speech assets and release configuration determine the available experience.',
    capabilitiesHeading: 'Useful capabilities, deliberately scoped',
    capabilities: [
      { name: 'On-device model execution', what: 'Compatible local models support bounded conversational and planning paths. Profiles have different capabilities; model installation and sufficient memory are required.', readiness: 'in-development', evidence: 'Concrete model runtimes exist in the reviewed source; limited earlier activation notes do not establish full current-build task qualification.' },
      { name: 'Native tools without a loaded LLM', what: 'Supported note creation/search, app launches, dialer and draft handoffs use native routes. A dialer handoff is not an automatically placed call; an opened draft is not a sent message.', readiness: 'working', evidence: 'Rules and native executors are source-implemented. Final-build functions and permissions still need acceptance on the supported device matrix.' },
      { name: 'Blind Aid', what: 'Independent local camera analysis provides object cues through speech, tones and haptics without a loaded conversational model. Assistive only—not certified navigation, guaranteed obstacle avoidance or a replacement for a mobility aid.', readiness: 'working', evidence: 'Source-implemented detector and native feedback; limited owner/developer observations exist on an earlier build. General multimodal scene description is disabled in the inspected source.' },
      { name: 'On-device speech options', what: 'Use available supported speech packs or device-local recognition. The Android on-device fallback requires Android 12+ and device support; some catalog languages are display-only, not downloadable packs.', readiness: 'in-development', evidence: 'Speech paths and fallback policy are source-reviewed. The app Android floor is not a speech-coverage guarantee; current voice workflow qualification remains incomplete.' },
      { name: 'Task intelligence', what: 'Keep notes, reminders and useful preferences close at hand. Saved reminders are distinct from delivered notifications, and reminder delivery is approximate and opt-in.', readiness: 'in-development', evidence: 'Organizer and reviewed-note paths are implemented; current-build background, reboot and notification-delivery acceptance remain separate.' },
      { name: 'Reviewed connected work', what: 'Ordinary email and WhatsApp routes open drafts. Separate native Google-provider code supports specifically reviewed operations; supported calendar changes and browser field edits have their own gates.', readiness: 'in-development', evidence: 'Source-backed exact-review and provider paths. Account scopes, network access and live provider qualification apply; configuration alone does not prove successful delivery.' },
      { name: 'Restricted release boundaries', what: 'Cross-app Accessibility automation and Owl planning are disabled in the inspected release configuration. Sensitive payment, OTP and credential action classes are blocked outright by the relevant source policies; no universal app control is offered.', readiness: 'working', evidence: 'Release distribution flags and manifest were inspected. Source policy is not independent proof of every runtime path or a Play approval.' },
      { name: 'Finance stays with you', what: 'Finance is read-only by product policy. UnoOne does not offer payment, transfer or trade automation, now or as a permission upgrade.', readiness: 'working', evidence: 'Source-level browser and device restrictions support the policy. Heuristic app classification is not a proven universal execution-time guarantee or financial-account aggregation coverage.' },
      { name: 'Personal memory on the phone', what: 'Encrypted app data holds useful records and preferences with bounded retrieval. Exports, migration recovery and configured mirroring are separate data paths—not proof that every file or action stays encrypted and offline.', readiness: 'in-development', evidence: 'Encrypted database and key handling are source-implemented. Current-device migration, preservation and full workflow validation remain open.' },
      { name: 'Supported Android documents', what: 'Read supported files and fill supported PDF forms or DOCX templates into a new copy. Scanned/flat PDFs are read-only, password-protected PDFs are unsupported and signature fields are skipped; input and OCR page limits apply.', readiness: 'in-development', evidence: 'Android-specific loader and save-as-copy code reviewed. Test definitions are not executed device results, and Windows document evidence is not transferred to Mobile.' },
    ],
    sections: [
      { title: 'Choose a task, not unlimited phone control', body: 'Start with a supported native note, app launch or draft handoff. Model-backed assistance, provider operations and assistive camera tools are different paths. Each needs the relevant permissions and its own observed outcome.' },
      { title: 'What the November review establishes', body: 'The source review and 14–16 November notes describe real implementation and some bounded phone observations. Historical automated reports concern earlier source states. No reviewed record binds a complete current physical acceptance run to a full current artifact hash and immutable source identity.' },
      { title: 'What to check before access', body: 'The reviewed Android 9+/arm64 source floor is not an all-phone qualification. Confirm the final distribution, phone/model matrix, available speech assets and setup guide. The development APKs are not public downloads and no Play-approved release is claimed.' },
    ],
    faqs: [
      { q: 'What works without a language model?', a: 'Supported native functions such as notes, app launching, dialer and reviewable draft handoffs can use deterministic routes. Blind Aid has its own local detector. This does not make every workflow model-free or available on every phone.' },
      { q: 'Can Mobile send messages or change my calendar?', a: 'Ordinary email/WhatsApp routes open drafts for you to review and send. Separate native provider and calendar paths implement specifically reviewed operations. Their availability depends on the shipping build, permissions, account scopes and live-provider qualification—not universal automatic sending.' },
      { q: 'Will it work on my phone and in my language?', a: 'Check the supported phone, model and speech-pack matrix when an approved release is available. Android version and RAM alone are not enough. The on-device speech fallback needs Android 12+ and device support; a language shown in the catalog may not have a downloadable pack.' },
      { q: 'Does Mobile need the internet?', a: 'Supported local AI, memory and native tools can work on-device after the required assets are installed. Research, provider connections and external app services use the network. Exports and configured mirroring have their own data flows.' },
      { q: 'Can it control any app or automate payments?', a: 'No. The inspected release disables cross-app Accessibility automation and Owl planning. Financial transactions are outside the product policy: no payment, transfer or trade automation. Sensitive flows remain with the user.' },
    ],
  },
  {
    path: '/unoone/sync',
    eyebrow: 'One Agent · Two Devices',
    h1: 'Continuity Between Your Phone and Your Computer',
    description:
      'UnoOne is a software family spanning UnoOne Power (desktop) and UnoOne Mobile (Android). Each device stores its own encrypted local state; continuity is being developed as an explicit, consent-based protocol. No physical phone–desktop round trip is yet qualified.',
    status: PAI_STATUS_SYNC,
    audience:
      'If you start something on one device and finish it on another, this page explains how that continuity is meant to work — what is implemented, what is being tested, and what remains on the roadmap.',
    capabilities: [
      { name: 'Logical personal identity', what: 'The vault concept binds a personal identity — not just an installation — to the agent layer.', readiness: 'working', evidence: 'Vault identity layers live in both builds and are cross-tested in CI.' },
      { name: 'Device-local encrypted storage', what: 'Each device keeps its state in its own encrypted store; nothing assumes a shared storage device between phone and desktop.', readiness: 'working', evidence: 'Per-platform vault stores exist; drive-vault integration is a desktop-attach feature, not a phone requirement.' },
      { name: 'Persistent context across model switches', what: 'Memory is managed by the agent layer, so the same personal context applies whichever local model is loaded.', readiness: 'working', evidence: 'Memory restore verified across restarts and model reloads on the desktop build.' },
      { name: 'Task coordination', what: 'Planned: tasks recognised on one device would flow to the other device’s permitted execution lane after pairing and outcome checks are qualified.', readiness: 'planned', evidence: 'Coordination lanes exist as pairing + ledger infrastructure; no end-to-end device round trip qualified.' },
      { name: 'Local network possibilities (Wi-Fi pairing)', what: 'Phone–desktop pairing is designed to work over the local network first, with remote connectivity as a later, clearly-gated option.', readiness: 'in-development', evidence: 'mTLS pairing with fingerprint pinning unit-tested in CI; not yet device-verified.' },
      { name: 'Verified completion feedback', what: 'In development: outcomes from an executing device would return as receipts; cross-device receipt delivery is not yet qualified.', readiness: 'in-development', evidence: 'Receipt surfaces exist per-device today; the cross-device path is part of the roadmap.' },
    ],
    sections: [
      {
        title: 'The proposed flow, in one line each',
        body: 'A message arrives on the phone. The agent flags a possible task. You authorise the access. UnoOne Power executes the permitted heavier work. The result is verified against its intent. The phone displays the verified outcome. Pairing protocol and per-device receipt components have implementation and unit-test evidence; this does not establish a working two-device user workflow. The full round trip remains unqualified.',
      },
      {
        title: 'What we will not claim',
        body: 'We do not imply that the two devices share one physical encrypted store automatically. There is no “magic cloud drive” in the design: continuity is a protocol you can inspect, with consent at every step.',
      },
    ],
    faqs: [
      {
        q: 'Is cross-device sync shipping now?',
        a: 'No. The pairing protocol is designed and unit-tested, but no physical phone–desktop round trip has been qualified, manual or automatic. We will say so on this page when it changes.',
      },
      {
        q: 'Do I need a USB drive for any of this?',
        a: 'No. Today’s PAI/UnoOne story is desktop and Android software. We also maintain a historical, patent-pending portable-architecture filing, which is prior research — not the flagship product.',
      },
    ],
  },
  {
    path: '/enterprise-ai',
    eyebrow: 'Private AI Infrastructure',
    h1: 'Permissioned Agents With Governance Built In',
    description:
      'InBharat.ai’s enterprise work applies the same private-AI discipline to organisations: permissioned agents, approval-gated tool execution, observable outcomes and self-hostable components — implemented through JAK Swarm and JAK Shield.',
    status: 'Open-source components in use with controlled testing. Institutional deployment is by engagement, not self-service.',
    audience:
      'Enterprises and institutions that need agentic AI without abandoning governance: approval workflows, auditability, bounded execution and self-hosting where supported. Read the sections below for what is released today and what is in controlled testing.',
    capabilities: [
      { name: 'JAK Swarm', what: 'A self-hostable agentic workflow system built on evidence: agents work from an evidence graph, plans are executed against specs, drift is detected, and only approved effects leave the loop.', readiness: 'working', evidence: 'Open-source repository with evidence-graph, drift detection and audit-trail architecture.' },
      { name: 'JAK Shield', what: 'A security gateway for agent tool use: sensitive-data detection, sandboxed execution, and tamper-evident audit logs so agent actions can be reviewed.', readiness: 'working', evidence: 'Open-source repository; specific shared design concepts do not make this independent service a UnoOne module.' },
      { name: 'Tool-use governance', what: 'Explicit permission boundaries with approval requests instead of background autonomy — humans stay in the loop by design.', readiness: 'working', evidence: 'Approve/confirm/block tier design shared with the on-device safety contract.' },
      { name: 'Auditability', what: 'Tamper-evident trails of what agents did, so a team can review actions after the fact.', readiness: 'working', evidence: 'Audit trail outputs; portable HMAC evidence is internal today — portable third-party attestation is not.' },
      { name: 'Self-hosted AI where supported', what: 'Institutions can run the components on their own infrastructure; the personal products keep memory local; optional connected actions have separate data flows.', readiness: 'working', evidence: 'Open-source, self-hostable lanes; specific operating-system/hardware support stated per repository.' },
      { name: 'Institutional deployment options', what: 'Pilot programmes for education institutions and teams, starting with scoped, verifiable workflows.', readiness: 'in-development', evidence: 'Pilots by engagement with the founders; no self-serve deployments.' },
    ],
    sections: [
      {
        title: 'Private agentic AI for a private world, applied',
        body: 'The PAI design principles scale to organisations: agents act only inside granted boundaries, sensitive operations are gated before they run, and outcomes are checked rather than trusted. InBharat.ai builds both the agent layer and the governance gates so the same engineering discipline covers your people’s assistants and your systems.',
      },
      {
        title: 'What we will not claim',
        body: 'This enterprise offering does not claim certified compliance or verified institutional production deployments. Company recognition and programme participation are listed separately and do not certify or endorse these products. Release status is stated per component, and enterprise support is scoped through direct engagement with us.',
      },
    ],
    faqs: [
      {
        q: 'What is JAK Swarm?',
        a: 'It is an agentic workflow system built on evidence graphs: the agent’s work is grounded in sources, planned as bounded specs, checked for drift, risk-gated and logged — an auditable autonomous-work loop rather than an unboxed agent.',
      },
      {
        q: 'What is JAK Shield?',
        a: 'A security gateway for agent tool use — the risk-gate layer that screens sensitive operations, sandboxes execution and produces audit logs for review.',
      },
      {
        q: 'Can we run these in our own infrastructure?',
        a: 'The components are built self-hostable and open-source. Deployment support is scoped per engagement; contact us to discuss a pilot.',
      },
    ],
  },
  {
    path: '/technology',
    eyebrow: 'Technology',
    h1: 'The Engineering Behind UnoOne',
    description:
      'How UnoOne is engineered: local inference with hardware-aware scheduling, memory budgets that fail closed instead of thrashing, memory held outside the model, typed tool contracts, on-device safety tiers, and SILT, our trust-gated skill-transfer research.',
    status: 'Underlying technology in active development; each capability is stated with its current verification level.',
    audience:
      'This page is for engineers, researchers and technical decision-makers who want the mechanics behind the product story — what runs where, how the gates work, and what has been measured.',
    capabilities: [
      { name: 'Local inference', what: 'A local inference server runs within a pinned session context with an optimised KV cache, on CPU or GPU depending on the host.', readiness: 'working', evidence: 'Streaming runs measured; memory behaviour measured for CPU and GPU slots.' },
      { name: 'Hardware-aware scheduling', what: 'Models are checked against measured RAM/VRAM budgets, and configurations can be refused when the budget is not met. This reduces admission risk; it is not a guarantee against host stalls or resource pressure.', readiness: 'working', evidence: 'Admission-gate test suites; a previously retracted summary (memory saving) was corrected with re-measured results.' },
      { name: 'Memory optimisation', what: 'Context cache precision and slot handling trade latency and memory use per session. Configuration changes still need quality and stability evaluation.', readiness: 'working', evidence: 'Config comparisons measured and documented before shipping a default.' },
      { name: 'Model-independent memory', what: 'Personal records are written by the agent layer and survive model switches — an explicit architectural boundary.', readiness: 'working', evidence: 'Memory restore across restarts and switches.' },
      { name: 'Typed tool contracts', what: 'Typed contracts describe supported tools, permissions and outcomes. Windows and Android implementations and shipping configurations differ; a shared design does not establish feature parity.', readiness: 'working', evidence: 'Internal contract/test evidence; final platform coverage must be verified on each release.' },
      { name: 'On-device safety tiers', what: 'Supported calls use direct, confirm, strong-confirm or block tiers. Payment, OTP and credential classes have source-level restrictions; financial transactions are excluded by product policy. Enforcement still needs current-build validation across execution paths.', readiness: 'working', evidence: 'Safety contract unit tests with the tier matrix on the phone build.' },
      { name: 'Agent lifecycle controls', what: 'Boundaries, budgets, cancellation and shutdown keep long tasks under control on desktop and Android.', readiness: 'working', evidence: 'Stop/resume, staging and honest reap verified during live diagnostics.' },
      { name: 'SILT', what: 'A trust-gated AI learning layer for representing, admitting and rolling back narrow AI capabilities — an evidence-first alternative to copying model weights.', readiness: 'research', evidence: 'Published research programme, not runtime validation; recorded as patent-pending in India (application 202631101454).' },
      { name: 'Historical portable architecture (Pocket AI)', what: 'The portable host-adaptive private AI architecture that started the PAI work; its removable-drive formulation is prior research, retired as a marketed product.', readiness: 'historical', evidence: 'Recorded filing: Indian patent application 202631102427. Historical scope only; current legal status requires owner records.' },
    ],
    sections: [
      {
        title: 'Why memory budgets matter',
        body: 'Running a personal agent on ordinary hardware turns on resource discipline: knowing what the session cache and model weights really cost, refusing configurations that exceed the estimated budget, and designing gates that fail closed. The latest 27B experiment still reached critical host pressure and unloaded before a user turn; admission policy is not a universal stability guarantee.',
      },
      {
        title: 'Verification as a product principle',
        body: 'Actions checked against intent — receipts of what changed — are a first-class product feature rather than a debugging afterthought, because unverified autonomy is neither private nor governable.',
      },
    ],
    faqs: [
      {
        q: 'How does UnoOne pick a model for my machine?',
        a: 'A measured memory budget counts weights, projector and session cache against available RAM and GPU memory, and can refuse configurations that do not fit. Real resource pressure and startup stalls remain part of qualification; admission checks do not guarantee responsiveness in every case.',
      },
      {
        q: 'Is my memory safe if I switch models or devices?',
        a: 'Records live in the agent layer’s encrypted store, not inside a model, so context survives model changes; device-local stores keep each device’s data on that device.',
      },
      {
        q: 'What is SILT?',
        a: 'SILT is research into trust-gated transfer of narrow AI capabilities, with held-out evaluation, admission rules and rollback. A published programme or patent filing is not evidence of a release-qualified runtime, autonomous self-improvement or AGI.',
      },
    ],
  },
];

export const pageByPath = (pathname: string): PrivateAiPage =>
  UNOONE_PAGES.find((page) => page.path.replace(/\/+$/, '') === pathname.replace(/\/+$/, '')) ?? UNOONE_PAGES[0];