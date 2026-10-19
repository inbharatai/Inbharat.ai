export interface PrivateAIEntry {
  path:string; name:string; eyebrow:string; h1:string; title:string; description:string;
  status:string; audience:string; features:{title:string;body:string}[];
  sections:{title:string;body:string}[]; faqs:{q:string;a:string}[];
}
export const PRIVATE_AI_PAGES:PrivateAIEntry[]=[
 {path:'/unoone',name:'UnoOne',eyebrow:'PRIVATE PERSONAL AI',
 h1:'One private personal agent. Phone and computer.',
 title:'UnoOne | Private AI for Phone and Desktop | InBharat.ai',
 description:'Discover UnoOne Power and UnoOne Mobile, local-first AI assistants for computer and Android workflows with owner-controlled permissions and a cross-device vision.',
 status:'Early development · pilots by invitation',
 audience:'Professionals and individuals who want AI to work on their own devices with clear permissions and control.',
 features:[
 {title:'UnoOne Power',body:'A desktop agent direction for files, research, coding and controlled workflows. Hardware-aware local inference is a central design goal.'},
 {title:'UnoOne Mobile',body:'Android assistance built on native-owned permissions, bounded screen actions and local speech components.'},
 {title:'Private continuity',body:'Separate encrypted device vaults with a consent-based cross-device synchronization architecture. Full integrated release qualification is pending.'}],
 sections:[
 {title:'Your assistant should serve you',body:'The aim is AI that can help complete everyday work, with visible tool permissions and honest verification of the actual results.'},
 {title:'Local-first, not cloud-only',body:'Supported operations can run locally. Optional internet research, external AI providers and integrations have separate data-sharing boundaries.'},
 {title:'What is ready?',body:'UnoOne remains under active development. Documentation and automated tests exist, but current desktop compilation and physical-device integration checks must complete before a production-ready claim.'}],
 faqs:[
 {q:'Does UnoOne require a pen drive?',a:'No. UnoOne Power and UnoOne Mobile do not require removable-drive hardware.'},
 {q:'Can the assistant work offline?',a:'Supported local operations are designed for offline use. Web and connected services require connectivity.'},
 {q:'Do Power and Mobile sync?',a:'Secure cross-device continuity is part of the architecture; available workflows depend on the qualified release.'}]},
 {path:'/unoone/power',name:'UnoOne Power',eyebrow:'LOCAL-FIRST DESKTOP AI',
 h1:'A personal AI agent for the computer you own.',
 title:'UnoOne Power | Private AI Assistant for Desktop | InBharat.ai',
 description:'UnoOne Power is a local-first desktop AI agent for research, coding, files and controlled task automation. Explore the current development preview.',
 status:'Desktop development preview · integrated build qualification pending',
 audience:'Computer users, researchers and developers who need AI close to local files and workflows.',
 features:[
 {title:'Local model architecture',body:'Hardware-aware execution and resource-conscious model management for supported desktop hardware.'},
 {title:'Real computer workflows',body:'Research, coding, files and task automation are the intended desktop capabilities, controlled through explicit tools.'},
 {title:'Actions with boundaries',body:'Permission checks and verifiable outcomes take priority over opaque unrestricted execution.'}],
 sections:[
 {title:'More than a chat interface',body:'UnoOne Power is built toward completing useful computer tasks with structured plans, tool actions and traceable results.'},
 {title:'Connected when you choose',body:'Local inference reduces reliance on remote services; web research and optional integrations operate through separately disclosed permissions.'},
 {title:'Engineering status',body:'The integrated UnoOne desktop code has not completed all current build and runtime qualification. Ask for a verified pilot rather than assuming general availability.'}],
 faqs:[
 {q:'Is UnoOne Power a Windows AI assistant?',a:'Windows desktop assistance is a target. Tested builds and compatibility vary by release.'},
 {q:'Can it work with local files?',a:'Scoped file workflows are part of its intended capabilities. Exact permissions depend on the tested implementation.'},
 {q:'Do I need special portable hardware?',a:'No external pen drive is required for the current UnoOne direction.'}]},
 {path:'/unoone/mobile',name:'UnoOne Mobile',eyebrow:'ANDROID PRIVATE AI',
 h1:'Everyday Android assistance, with you in control.',
 title:'UnoOne Mobile | Private Android AI Agent | InBharat.ai',
 description:'Meet UnoOne Mobile, an Android AI agent using local speech, native-authorized controls and action verification. Alpha development status.',
 status:'Android alpha · physical-device qualification pending',
 audience:'People looking for a privacy-conscious Android assistant with bounded device actions.',
 features:[
 {title:'On-device components',body:'Local speech and on-device inference components support the private AI direction.'},
 {title:'Native authorization',body:'Native Android code, not the language model, controls action permission, cancellation and verification.'},
 {title:'Honest action receipts',body:'The assistant distinguishes an action it performed from a wider user goal it has actually verified.'}],
 sections:[
 {title:'Assistance without unrestricted control',body:'Supported tasks operate within explicit app and permission scopes. UnoOne does not claim autonomous control of every Android app.'},
 {title:'Designed to pair with Power',body:'Mobile and desktop are planned to share a personal agent identity while retaining independently encrypted data stores.'},
 {title:'Alpha release limits',body:'Automated checks have been documented; current physical phone qualification and end-to-end testing remain necessary.'}],
 faqs:[
 {q:'Can it control every phone app?',a:'No. Android automation is limited by allowed actions, OS restrictions and granted user permissions.'},
 {q:'Does it need cloud AI?',a:'Supported local operations may work offline; external services need connection and user choice.'},
 {q:'Is it generally available?',a:'Treat UnoOne Mobile as an alpha product until current device qualification and release evidence confirm otherwise.'}]},
 {path:'/enterprise-ai',name:'Enterprise AI',eyebrow:'SECURE AUTONOMOUS OPERATIONS',
 h1:'AI agents need safeguards before they act.',
 title:'Private Enterprise AI Agents & Audit Trails | InBharat.ai',
 description:'Build safer enterprise AI workflows with JAK Shield and JAK Swarm: risk gates, approvals, evidence trails and controlled tool execution.',
 status:'Controlled evaluation · integration-specific readiness',
 audience:'Engineering, security and operations leaders reviewing AI agent deployment.',
 features:[
 {title:'JAK Shield',body:'Deterministic policy enforcement, redaction and approval gates for supported AI agent tool calls.'},
 {title:'JAK Swarm',body:'Workflow coordination with evidence graphs, drift checks and auditable handoffs.'},
 {title:'Human oversight',body:'Controls for risky actions help keep permissions and accountability explicit.'}],
 sections:[
 {title:'Safety cannot be prompt-only',body:'Deterministic software should enforce execution boundaries instead of trusting a model to police itself.'},
 {title:'Evidence for each action',body:'Signed or otherwise verified audit records and approval decisions matter when diagnosing consequential workflows.'},
 {title:'Release qualification',body:'JAK Shield documentation describes controlled early testing rather than a production-secure hosted gateway. A pilot needs scoped evaluation.'}],
 faqs:[
 {q:'What is an AI agent security gateway?',a:'A layer that reviews requests to use tools before allowing actions under specified policy.'},
 {q:'Does JAK Shield support approvals?',a:'The architecture includes human approval gates for defined risk categories.'},
 {q:'Can enterprise agents be self-hosted?',a:'Deployment options must be evaluated for the current project, supported integrations and security requirements.'}]},
 {path:'/technology',name:'Technology',eyebrow:'PRIVATE AI ENGINEERING',
 h1:'Private AI is an engineering discipline.',
 title:'Private AI Technology & SILT Research | InBharat.ai',
 description:'Explore SILT trust-gated AI research, hardware-aware local inference, encrypted device continuity and security controls behind InBharat.',
 status:'Research · measurable experiments · release qualifications',
 audience:'Developers, academic partners and organisations seeking evidence-based private AI design.',
 features:[
 {title:'SILT research',body:'Trust-gated, narrow skill transfer with held-out evaluation and explicit admission and rollback rules.'},
 {title:'Local AI operations',body:'Hardware-aware model scheduling and memory-conscious model lifecycle design.'},
 {title:'Verifiable agents',body:'Permission boundaries and evidence reporting to distinguish executed actions from verified outcomes.'}],
 sections:[
 {title:'Measure before making claims',body:'Research results belong with their methods, source revision, hardware conditions and limitations.'},
 {title:'Legacy hardware history',body:'An earlier portable-drive AI design remains part of historical research and filing records. The pen-drive product is discontinued.'},
 {title:'From prototypes to pilots',body:'Cross-device agents and enterprise controls move through tests, device qualification and supervised evaluation rather than marketing guarantees.'}],
 faqs:[
 {q:'What is SILT?',a:'SILT is trust-gated skill-transfer research for narrowly defined AI capabilities, subject to validation.'},
 {q:'Is the portable AI pen drive still a product?',a:'No. The pen-drive product has been cancelled; current focus is UnoOne Power and Mobile.'},
 {q:'Does local-first mean no internet ever?',a:'No. Supported local operations can stay on-device, while optional connected features use clearly defined external services.'}]},
];