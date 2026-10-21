/**
 * PAI / UnoOne positioning content for the private-AI pages.
 *
 * RULES FOR THIS FILE (non-negotiable):
 * 1. Only claims surfaced here may be used on /unoone* pages.
 * 2. Every claim must stay inside what was verified on the local
 *    UnoOne desktop (Windows) and Android (Kotlin) development builds,
 *    including 2026-10 gates: desktop cargo suites green, Android
 *    219 suites / 1,531 unit tests green, historical Xiaomi 14 device runs
 *    (July 2026) verified on an earlier tree.
 * 3. "Status" strings are shown verbatim on the site — honest labels
 *    (working / in development / planned), never invented certifications.
 * 4. No removable-drive product marketing: Pocket AI is described as a
 *    historical patent-pending filing where patent history is legally
 *    relevant, not as a consumer product hero.
 */

export type Readiness = 'working' | 'in-development' | 'planned';
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

export const PAI_STATUS_POWER = 'Working development builds, verified on the lead engineer’s Windows test system. Broad release validation is ahead.';
export const PAI_STATUS_MOBILE =
  'Android alpha: local development verified in CI; physical-device validation is ongoing on supported test hardware.';
export const PAI_STATUS_SYNC =
  'In development: manual, consent-based pairing is designed and unit-tested; an automatic phone–desktop round trip is not yet qualified.';
export const PAI_STATUS_PLATFORM =
  'PAI is our current flagship concept: one personal private AI agent. Early access is offered to pilot partners while release builds are qualified.';

export const UNOONE_PAGES: readonly PrivateAiPage[] = [
  {
    path: '/private-ai',
    eyebrow: 'PAI — Private Agentic AI',
    h1: 'PAI: One Personal Private AI Agent, Pronounced “Pi”',
    description:
      'PAI (pronounced “Pi”) is InBharat.ai’s flagship concept: a persistent, permission-controlled personal AI agent that lives on your own devices. This page defines what PAI is, the loop it runs on every task, and the boundaries it enforces — from understanding and planning to authorisation, action and verified outcomes.',
    status: 'Design concept implemented through the UnoOne ecosystem: working development builds verified locally; release validation ahead.',
    audience:
      'Read this page to understand the definition and engineering principles behind PAI; visit the UnoOne pages for the concrete products, their readiness and what each device does today.',
    capabilities: [
      { name: 'Agent, not chatbot', what: 'PAI is a persistent experience — it holds task state, carries context between sessions, and acts through tools rather than only answering in a chat window.', readiness: 'working', evidence: 'Task surfaces, memory and tool lanes implemented in the UnoOne builds.' },
      { name: 'Personal', what: 'One logical personal identity per owner; the assistant’s memory, permissions and history belong to that identity, not to an app session.', readiness: 'working', evidence: 'Vault identity layers bind state to an encrypted personal identity in both builds.' },
      { name: 'Permission-controlled', what: 'Capabilities are opt-in per tool and per resource, displayed as approval cards, revocable at any time — with sensitive classes blocked outright on-device.', readiness: 'working', evidence: 'Desktop approval cards + granted-folder fences; Android SafetyPipeline tiers with payment/OTP/password blocks.' },
      { name: 'Verifies its own work', what: 'Actions are checked against their intended outcome — receipts of what actually changed — before the agent reports success.', readiness: 'working', evidence: 'Per-tool receipts and outcome checks across file, document, browser and connector lanes.' },
      { name: 'Model-independent memory', what: 'Memory is held outside the model in an encrypted agent-layer store, so context survives model switching, reloading and device changes within a device.', readiness: 'working', evidence: 'Restores across restarts and model switches; memory explorer visible in the desktop build.' },
      { name: 'Local by default', what: 'Planning and personal state stay on your hardware; connectivity is optional and permissioned, never assumed by the architecture.', readiness: 'working', evidence: 'Desktop runs local inference in a pinned session context; Android planning runs on-device (LiteRT-LM).' },
      { name: 'Cross-device continuity', what: 'The same agent experience spans desktop and Android through explicit, consent-based continuity lanes.', readiness: 'in-development', evidence: 'Pairing and ledger design unit-tested; the physical round trip is not yet qualified.' },
    ],
    sections: [
      {
        title: 'The loop PAI runs on every task',
        body: 'Understand → Plan → Authorise → Act → Verify. The agent forms an interpretation of the request, produces a bounded plan, asks for authorisation wherever a permission applies, executes through permitted tools on the device that owns the task, and verifies the result with real evidence before reporting it.',
      },
      {
        title: 'Boundaries as product features',
        body: 'Drafts-never-sends for messaging apps, never-types-credentials for website connections, fail-closed memory admission on constrained hardware: each boundary is enforced by deterministic code, not by asking a model to behave.',
      },
      {
        title: 'Where PAI is implemented today',
        body: 'The UnoOne desktop builds implement the full loop for files, documents, browser, connectors and coding workflows; the Android builds implement the planning, safety and speech layers, with staged activation being device-validated. See /unoone/power and /unoone/mobile for per-device readiness.',
      },
    ],
    faqs: [
      {
        q: 'What does PAI stand for?',
        a: 'PAI is the short name of Pocket AI, the personal private AI agent concept InBharat.ai introduced in 2025 and filed an Indian patent application for in August 2026 (application 202631102427). It is pronounced “Pi”, like the Greek letter. The original filing described a portable removable-drive formulation; the product evolved into software-only UnoOne Power and UnoOne Mobile, and Pocket AI is preserved as historical prior research rather than a marketed product.',
      },
      {
        q: 'Is PAI a product I can install today?',
        a: 'Not as a public download. It is implemented in the UnoOne development builds that are being verified for release; access today is through early-access pilot conversations and the InBharat AI web console.',
      },
      {
        q: 'How is PAI private if it connects to websites and mail?',
        a: 'Connections are opt-in, displayed as explicit permissions, and never share credentials: the agent recognises your login state in the browsers you use but never types passwords. Personal memory stays in the encrypted local store; sweeps and searches are the only outbound actions, and you grant each one.',
      },
    ],
  },
  {
    path: '/unoone',
    eyebrow: 'UnoOne',
    h1: 'One Personal Private AI Agent for Your Devices',
    description:
      'UnoOne is the software ecosystem that implements PAI — one personal private AI agent — as two coordinated products: UnoOne Power for Windows desktop and laptop, and UnoOne Mobile for Android. The model can change; the personal experience stays yours.',
    status: 'In active development with local verification on both devices. Not yet broadly released.',
    audience:
      'UnoOne is for people who want a capable AI assistant without handing every task, file and conversation to a cloud account — and for teams who want the same discipline in an organisation. Read each product page for what is working today versus what is being built, and contact us about early-access pilots.',
    capabilities: [
      { name: 'One agent identity', what: 'The same personal agent concept lives on desktop and Android; a logical personal identity is kept per device.', readiness: 'working', evidence: 'Local builds carry per-device vault identity; pairing layers unit-tested in CI.' },
      { name: 'Local model execution', what: 'Inference runs on your hardware. Model selection adapts to the machine’s available memory instead of assuming a data-centre budget.', readiness: 'working', evidence: 'RAM-aware admission test suites pass; measured load/unload diagnostics on the desktop build.' },
      { name: 'Permission-controlled tools', what: 'Every tool — files, browser, commands, connected sites — runs behind explicit, revocable permissions with approval cards.', readiness: 'working', evidence: 'Granted-folder fence + approval cards verified in live UI sessions on the desktop build.' },
      { name: 'Persistent personal memory', what: 'Conversation turns and task context are stored by the agent layer, encrypted, and restored across restarts — independent of which model is active.', readiness: 'working', evidence: 'Chat memory restores the last 30 turns across restarts; memory explorer shows the store.' },
      { name: 'Action verification', what: 'Bounded actions are checked against their intended outcome, with receipts, instead of trusting the model’s self-report.', readiness: 'working', evidence: 'Executed with honest outcomes in live desktop sessions for file, doc, browser and connector tools.' },
      { name: 'Cross-device continuity (phone ↔ desktop)', what: 'Context and tasks move between devices under explicit control: manual, consent-based pairing today; automatic syncing stays on the roadmap until a physical device round trip is qualified.', readiness: 'in-development', evidence: 'UNIFIED_SYNC_V2 ledger and pairing lanes have unit tests; no physical round trip yet.' },
    ],
    sections: [
      {
        title: 'Two products, one experience',
        body: 'UnoOne Power is the autonomous personal AI environment for desktop and laptop. UnoOne Mobile is the same idea inside the Android environment — not a chat window, but an assistant that can interpret an instruction, check permissions, take a bounded action in an approved app and report what actually happened.',
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
        a: 'UnoOne is InBharat.ai’s software ecosystem for PAI, one personal private AI agent. It ships as UnoOne Power (desktop) and UnoOne Mobile (Android), so the same personal assistant experience spans both devices under your control.',
      },
      {
        q: 'How is this different from a local chatbot?',
        a: 'A local chatbot runs a model in a window. UnooOne is being built as a personal AI operating layer: it holds task state, files, permissions and memory; uses permitted tools; and verifies outcomes — the model is one component the layer can swap.',
      },
      {
        q: 'Does my data go to the cloud?',
        a: 'The design is local-first: conversation memory and records are stored encrypted on your own device by the agent layer. Some optional features (a mail sweep, a web search) reach out, and each one is a permission you explicitly grant.',
      },
      {
        q: 'Does cross-device sync work today?',
        a: 'Not as an automatic pipeline. A manual, consent-based pairing design exists with unit tests on both sides, and a physical phone–desktop round trip is not yet qualified — until then we treat sync as in development, not shipped.',
      },
      {
        q: 'How can I try it?',
        a: 'UnoOne is being validated for release, so access is via early-access and pilot conversations — contact us through the contact page. The InBharat AI console on this site is immediately available to try in the browser.',
      },
    ],
  },
  {
    path: '/unoone/power',
    eyebrow: 'UnoOne Power',
    h1: 'Your Desktop Personal AI Agent',
    description:
      'UnoOne Power is the autonomous personal AI environment for Windows desktop and laptop: local models chosen to fit your machine, coding and file workflows, browser operations, research, vision and OCR — executed with permissions and verified outcomes.',
    status: PAI_STATUS_POWER,
    audience:
      'UnoOne Power is designed for people who work with real files, real browsers and real deadlines — developers, researchers, founders and busy professionals — and want an assistant that operates on their own computer instead of uploading their working life.',
    capabilities: [
      { name: 'Hardware-aware execution', what: 'The assistant checks available system RAM and GPU/VRAM, then admits a local model configuration that fits — refusing to load when the budget is not met (fail closed).', readiness: 'working', evidence: 'Admission policy with budget math is unit-tested; measured load/unload results on the test system.' },
      { name: 'Model routing and switching', what: 'Small fast paths for simple requests, heavier agent lanes for hard work, and manual model management (stop/load, verified artifacts) — including a 27B-class model running within a constrained memory budget on the test machine.', readiness: 'working', evidence: 'Router lanes and model manager exercised live; switch loads hash-verify artifacts before boot.' },
      { name: 'Personal memory', what: 'Every chat turn is written as an encrypted record and restored across restarts; memory is managed by the agent layer, so the experience does not depend on which model is loaded.', readiness: 'working', evidence: 'Restores last 30 turns with an honest banner; memory search works across restarts.' },
      { name: 'Coding workflows', what: 'A fenced workspace with diff/patch preview, task worktrees, budgets and cancellation so code changes stay reviewable.', readiness: 'working', evidence: 'Coding lanes implemented and exercised in verification runs; confirmation gate remains on for safety.' },
      { name: 'Files and documents', what: 'Reading, writing, copying and searching files, plus creating real PDF, DOCX, MD and TXT documents — inside folders the user has granted.', readiness: 'working', evidence: 'Byte-exact fs operations and document writers verified in gates and live runs.' },
      { name: 'Browser operations', what: 'Typed browser actions (navigate, click, type, extract, screenshot) with scheme allowlists — no arbitrary script injection — and login state that persists across restarts in the shared browser engine.', readiness: 'working', evidence: 'Browser policy tests green; popup sign-in flows live-verified.' },
      { name: 'Website connections', what: 'The agent recognises login state on site profiles it has been granted (strong/weak/none → honest states) and asks before acting — it never types your credentials.', readiness: 'working', evidence: 'Login-evidence engine with receipts, vault-bound registry, never-types-credentials rule.' },
      { name: 'Web research', what: 'Research modes gather sources, and e-mail sweeps can surface unread items through a connector you configure.', readiness: 'working', evidence: 'Research lanes run live; provider tools are read-only. (Provenance/citation layer: remaining work.)' },
      { name: 'Vision and OCR', what: 'Image understanding and screen OCR for describing scenes and reading text (chat image attachments and describe/OCR lanes).', readiness: 'in-development', evidence: 'Implemented with honest confidence reporting; no public accuracy corpus yet.' },
      { name: 'Form workflows', what: 'Assisted form completion inside the browser engine with confirmation for submit/upload/download actions.', readiness: 'working', evidence: 'Confirmation-gated actions per browser policy; verified in browser acceptance runs.' },
      { name: 'Offline voice interaction', what: 'Local speech recognition and synthesis on your device for the supported language set — no always-on cloud microphone.', readiness: 'working', evidence: 'InBharat Audio speech router verified across a 19/19 live language matrix.' },
      { name: 'Personal background assistant', what: 'Task, commitment and notification surfaces for planning what matters — the outcome ledger and assistant surfaces exist and are being verified.', readiness: 'in-development', evidence: 'Build deployed; end-to-end background follow-through is the open item.' },
    ],
    sections: [
      {
        title: 'Understand → Plan → Authorise → Act → Verify',
        body: 'Every substantive request goes through the same loop: the agent understands the task, plans bounded steps, asks for authorisation where permissions are needed, acts through permitted tools, and verifies the result with real evidence (files written, pages loaded, receipts in the log) rather than asserting success.',
      },
      {
        title: 'Memory budgets measured, not guessed',
        body: 'Local models are admitted by a memory budget that counts weights, projector, context cache and headroom against the machine’s capacity — and stays out of the way when the budget is not met. On our test system this has been the difference between stable sessions and host-wide stalls.',
      },
      {
        title: 'Status, honestly',
        body: 'Power is development-stage software with verification runs on a single test environment. System requirements depend on your machine’s RAM and GPU. Some features remain actively being finished — background task follow-through, a recording summarizer, and macOS packaging are not shipped. We will not advertise downloads until the release audience is properly qualified.',
      },
    ],
    faqs: [
      {
        q: 'Can UnoOne Power work offline?',
        a: 'The core paths — local model inference, memories, files, documents, coding workspace, offline speech — are designed to run without cloud services. Live web research and connector sweeps are optional online capabilities.',
      },
      {
        q: 'Which models can it run?',
        a: 'It runs local open-weight models from your configured model folder, with admission gating by available memory. Model artefacts are hash-verified before load. The experience is built so switching models does not switch away from your personal context.',
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
    eyebrow: 'UnoOne Mobile',
    h1: 'Your Android Personal AI Agent',
    description:
      'UnoOne Mobile is the autonomous personal AI environment for Android: an on-device planner, offline speech, screen understanding, reviewable drafts for app actions, and a permission pipeline that keeps the phone yours.',
    status: PAI_STATUS_MOBILE,
    audience:
      'UnoOne Mobile is for people whose day lives on their phone — messages, notifications, calls, errands — and who want an assistant that plans and acts inside Android’s rules rather than a chat app that pretends otherwise. Early access is offered to pilot partners while device validation continues.',
    capabilities: [
      { name: 'On-device model execution', what: 'A local LiteRT-LM planner runs on-device — no cloud round trip for planning — with cancellable inference and bounded context.', readiness: 'working', evidence: 'Planner modules and harnesses in the builds; the newest staged-activation path awaits device confirmation.' },
      { name: 'Device-aware model admission', what: 'Model tiers gate on the device’s RAM — if the device cannot afford a tier, it stays unloaded (fail closed).', readiness: 'working', evidence: 'Admission gates with golden vectors unit-tested' },
      { name: 'Offline speech interaction', what: 'Streaming on-device speech recognition and synthesis for supported languages, with wake-word sessions and cooldowns.', readiness: 'working', evidence: 'Engine runs verified on a supported hardware test (55 tests, 20 with all networks off — earlier tree).' },
      { name: 'Screen understanding (OCR + vision)', what: 'Screen capture preprocessing, OCR reading and object labelling power screen reading modes for accessibility.', readiness: 'working', evidence: '"Read Screen" verified in device runs.' },
      { name: 'Approved app interactions', what: 'The agent can prepare actions for apps like calendar, e-mail, WhatsApp or the dialer as reviewable drafts — and never presses the external app’s Send itself.', readiness: 'working', evidence: 'Draft-uri actions verified in device runs; safety contract blocks auto-send.' },
      { name: 'Risk-tiered permissions', what: 'Every tool call lands in a safety pipeline: some run directly, some need a tap-to-confirm, sensitive ones require strong confirmation — and payment/OTP/password/auto-send are blocked outright.', readiness: 'working', evidence: 'SafetyPipeline contract with 47 entries unit-tested; device LLM judge can only escalate, never relax.' },
      { name: 'Notifications (read-only intake)', what: 'A notification listener captures package/title/text into an encrypted local store — it cannot reply, dismiss or act on them.', readiness: 'in-development', evidence: 'Service + encrypted store ship; device integration evidence for intake is pending.' },
      { name: 'Task intelligence', what: 'A task board, notes and scheduled tasks let the plan extend beyond a single chat turn.', readiness: 'working', evidence: 'Screens and flows implemented in the Android build.' },
      { name: 'Audit and privacy controls', what: 'Audit viewer, privacy settings and a master Disable that blocks microphone, speech, inference, screen reading and accessibility actions until re-enabled.', readiness: 'working', evidence: 'Disable survived process restarts in verified device runs.' },
      { name: 'Personal memory on the phone', what: 'Encrypted local storage (Room + SQLCipher with a Rust-compatible crypto core) holds the device’s agent state.', readiness: 'working', evidence: 'Cross-platform crypto contract proven in CI; schema migration on devices still being verified.' },
    ],
    sections: [
      {
        title: 'A real agent loop on Android',
        body: 'Instruction → planning on-device → tool identification → permission check → bounded action → outcome check → verified report. When the action involves another app, the result is a draft you review — the assistant respects the app’s own Send/Save button and Android’s permission system, including biometric guards. Nothing here is designed to bypass phone security.',
      },
      {
        title: 'Status, honestly',
        body: 'The software is under active development with automated test gates green (219 suites / 1,531 tests locally + Rust crates green). The hardware validation history on this tree is in progress — an earlier tree earned a 55-test device run in July 2026. Features remain labelled working / in development only where evidence supports them; "unlimited Android control" is not and will not be a claim.',
      },
    ],
    faqs: [
      {
        q: 'Does UnoOne Mobile need the cloud?',
        a: 'No — planning, speech and screen understanding run on-device with local models. Online research is optional when granted.',
      },
      {
        q: 'Can it send WhatsApp messages for me?',
        a: 'It can prepare a message draft in the app for you to review and send. It does not press Send on external apps, and messaging actions require strong confirmation.',
      },
      {
        q: 'Will it work on my phone?',
        a: 'Device compatibility depends on RAM and Android version because the assistant runs local models and needs accessibility permissions you control. We publish the tested device list as validation proceeds.',
      },
      {
        q: 'What is on the sync and integration roadmap?',
        a: 'The phone–desktop continuity story (manual pairing today, automatic round trip later), richer notification intelligence, device corpus validation, and staged model tiers. We mark each as it becomes qualified.',
      },
    ],
  },
  {
    path: '/unoone/sync',
    eyebrow: 'One Agent · Two Devices',
    h1: 'Continuity Between Your Phone and Your Computer',
    description:
      'PAI is one agent experience spanning UnoOne Power (desktop) and UnoOne Mobile (Android). Each device stores its own encrypted local state; continuity is explicit, consent-based and verified — never a silent sync you cannot inspect.',
    status: PAI_STATUS_SYNC,
    audience:
      'If you start something on one device and finish it on another, this page explains how that continuity is meant to work — what is implemented, what is being tested, and what remains on the roadmap.',
    capabilities: [
      { name: 'Logical personal identity', what: 'The vault concept binds a personal identity — not just an installation — to the agent layer.', readiness: 'working', evidence: 'Vault identity layers live in both builds and are cross-tested in CI.' },
      { name: 'Device-local encrypted storage', what: 'Each device keeps its state in its own encrypted store; nothing assumes a shared storage device between phone and desktop.', readiness: 'working', evidence: 'Per-platform vault stores exist; drive-vault integration is a desktop-attach feature, not a phone requirement.' },
      { name: 'Persistent context across model switches', what: 'Memory is managed by the agent layer, so the same personal context applies whichever local model is loaded.', readiness: 'working', evidence: 'Memory restore verified across restarts and model reloads on the desktop build.' },
      { name: 'Task coordination', what: 'Tasks recognised on one device can flow to the other device’s execution lane.', readiness: 'planned', evidence: 'Coordination lanes exist as pairing + ledger infrastructure; no end-to-end device round trip qualified.' },
      { name: 'Local network possibilities (Wi-Fi pairing)', what: 'Phone–desktop pairing is designed to work over the local network first, with remote connectivity as a later, clearly-gated option.', readiness: 'in-development', evidence: 'mTLS pairing with fingerprint pinning unit-tested in CI; not yet device-verified.' },
      { name: 'Verified completion feedback', what: 'Outcomes that happen on the executing device surface back as receipts, keeping a task honest as it moves.', readiness: 'in-development', evidence: 'Receipt surfaces exist per-device today; the cross-device path is part of the roadmap.' },
    ],
    sections: [
      {
        title: 'The proposed flow, in one line each',
        body: 'A message arrives on the phone. The agent flags a possible task. You authorise the access. UnoOne Power executes the permitted heavier work. The result is verified against its intent. The phone displays the verified outcome. In today’s build the manual pairing and receipt pieces exist; the full automated round trip is a roadmap item until it is qualified end to end.',
      },
      {
        title: 'What we will not claim',
        body: 'We do not imply that the two devices share one physical encrypted store automatically. There is no “magic cloud drive” in the design: continuity is a protocol you can inspect, with consent at every step.',
      },
    ],
    faqs: [
      {
        q: 'Is cross-device sync shipping now?',
        a: 'No. The pairing protocol is designed and unit-tested, but no automatic phone–desktop round trip has been qualified. We will say so on this page when it changes.',
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
      { name: 'JAK Shield', what: 'A security gateway for agent tool use: sensitive-data detection, sandboxed execution, and tamper-evident audit logs so agent actions can be reviewed.', readiness: 'working', evidence: 'Open-source repository; the risk-gate layer is also the on-device safety contract in UnoOne Mobile.' },
      { name: 'Tool-use governance', what: 'Explicit permission boundaries with approval requests instead of background autonomy — humans stay in the loop by design.', readiness: 'working', evidence: 'Approve/confirm/block tier design shared with the on-device safety contract.' },
      { name: 'Auditability', what: 'Tamper-evident trails of what agents did, so a team can review actions after the fact.', readiness: 'working', evidence: 'Audit trail outputs; portable HMAC evidence is internal today — portable third-party attestation is not.' },
      { name: 'Self-hosted AI where supported', what: 'Institutions can run the components on their own infrastructure; the personal products keep their data local by design.', readiness: 'working', evidence: 'Open-source, self-hostable lanes; specific operating-system/hardware support stated per repository.' },
      { name: 'Institutional deployment options', what: 'Pilot programmes for education institutions and teams, starting with scoped, verifiable workflows.', readiness: 'in-development', evidence: 'Pilots by engagement with the founders; no self-serve deployments.' },
    ],
    sections: [
      {
        title: 'Private agentic AI for a private world, applied',
        body: 'The PAI design principles scale to organisations: agents act only inside granted boundaries, sensitive operations are gated before they run, and outcomes are checked rather than trusted. InBharat.ai builds both the agent layer and the governance gates so the same engineering discipline covers your people’s assistants and your systems.',
      },
      {
        title: 'What we will not claim',
        body: 'No certifications, partnerships or production deployments are advertised on this site. Release status is stated per component, and enterprise support is scoped through direct engagement with us.',
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
    h1: 'The Engineering Under PAI and UnoOne',
    description:
      'How UnoOne is engineered: local inference with hardware-aware scheduling, memory budgets that fail closed instead of thrashing, memory held outside the model, typed tool contracts, on-device safety tiers, and SILT, our trust-gated skill-transfer research.',
    status: 'Underlying technology in active development; each capability is stated with its current verification level.',
    audience:
      'This page is for engineers, researchers and technical decision-makers who want the mechanics behind the product story — what runs where, how the gates work, and what has been measured.',
    capabilities: [
      { name: 'Local inference', what: 'A local inference server runs within a pinned session context with an optimised KV cache, on CPU or GPU depending on the host.', readiness: 'working', evidence: 'Streaming runs measured; memory behaviour measured for CPU and GPU slots.' },
      { name: 'Hardware-aware scheduling', what: 'Models are admitted according to measured RAM/VRAM budgets with fail-closed behaviour, so the host stays responsive.', readiness: 'working', evidence: 'Admission-gate test suites; a previously retracted summary (memory saving) was corrected with re-measured results.' },
      { name: 'Memory optimisation', what: 'Context cache precision and slot handling are tuned to trade latency against RAM use, per session, without affecting quality gates.', readiness: 'working', evidence: 'Config comparisons measured and documented before shipping a default.' },
      { name: 'Model-independent memory', what: 'Personal records are written by the agent layer and survive model switches — an explicit architectural boundary.', readiness: 'working', evidence: 'Memory restore across restarts and switches.' },
      { name: 'Typed tool contracts', what: 'The tools the agent can call are defined as typed contracts that desktop and Android share, so the safety design is uniform.', readiness: 'working', evidence: 'Contract sync across a 42-tool registry, verified by CI.' },
      { name: 'On-device safety tiers', what: 'Tool calls pass through risk tiers (direct / confirm / strong-confirm / block) with payment, OTP and password classes blocked outright; the on-device judge can only escalate risk.', readiness: 'working', evidence: 'Safety contract unit tests with the tier matrix on the phone build.' },
      { name: 'Agent lifecycle controls', what: 'Boundaries, budgets, cancellation and shutdown keep long tasks under control on desktop and Android.', readiness: 'working', evidence: 'Stop/resume, staging and honest reap verified during live diagnostics.' },
      { name: 'SILT', what: 'A trust-gated AI learning layer for representing, admitting and rolling back narrow AI capabilities — an evidence-first alternative to copying model weights.', readiness: 'working', evidence: 'Public research site with published programme; patent-pending in India (application 202631101454).' },
      { name: 'Historical portable architecture (Pocket AI)', what: 'The portable host-adaptive private AI architecture that started the PAI work; its removable-drive formulation is prior research, retired as a marketed product.', readiness: 'planned', evidence: 'Indian patent application 202631102427 records this architecture; kept accurate for the record.' },
    ],
    sections: [
      {
        title: 'Why memory budgets matter',
        body: 'Running a personal agent on ordinary hardware turns on resource discipline: knowing what the session cache and model weights really cost, refusing loads that would stall the host, and designing gates that fail closed. That is what makes bigger models usable when RAM is the constraint rather than raw model quality.',
      },
      {
        title: 'Verification as a product principle',
        body: 'Actions checked against intent — receipts of what changed — are a first-class product feature rather than a debugging afterthought, because unverified autonomy is neither private nor governable.',
      },
    ],
    faqs: [
      {
        q: 'How does UnoOne pick a model for my machine?',
        a: 'A measured memory budget counts the model’s weights, projector and session cache against your device’s RAM and GPU, and refuses to load a configuration that would not fit — fail closed, so the host stays responsive.',
      },
      {
        q: 'Is my memory safe if I switch models or devices?',
        a: 'Records live in the agent layer’s encrypted store, not inside a model, so context survives model changes; device-local stores keep each device’s data on that device.',
      },
      {
        q: 'What is SILT?',
        a: 'A trust-gated learning layer for AI skill transfer on-device: capabilities, once represented as packets, test on held-out data, promote only if their benefit holds, enforce their own admission and rollback rules, and log an auditable trail.',
      },
    ],
  },
];

export const pageByPath = (pathname: string): PrivateAiPage =>
  UNOONE_PAGES.find((page) => page.path.replace(/\/+$/, '') === pathname.replace(/\/+$/, '')) ?? UNOONE_PAGES[0];