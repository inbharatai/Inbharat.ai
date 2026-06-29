/**
 * Lightweight manifest for the "Build AI with Reeturaj" article system.
 *
 * IMPORTANT: this file is imported client-side (by seo.config.ts →
 * lib/useDocumentHead, by the hub page, and by ArticlePage). It MUST stay
 * body-free — only metadata. Article markdown bodies are loaded lazily per
 * slug via content/articles.body.ts (import.meta.glob, eager:false) so they
 * stay out of the main bundle.
 *
 * `abstract` is the 40–60 word direct-answer paragraph: it feeds the
 * TechArticle `description`/`abstract` schema field, the static shell's
 * crawlable seoBody (build-seo.ts), and the on-page direct-answer callout.
 * `faq` feeds the FAQPage JSON-LD schema + the on-page FAQ section.
 */

export const ARTICLE_HUB_PATH = '/learn-ai-with-reeturaj';

/** Folder under public/ where per-article visuals live (copied verbatim by Vite). */
export const ARTICLE_ASSET_DIR = '/learn-ai-with-reeturaj';

export type ArticleCategory =
  | 'AI Foundations'
  | 'AI Tools'
  | 'Engineering'
  | 'DevOps'
  | 'Security'
  | 'InBharat';

/** Order controls the chip filter order on the hub. */
export const ARTICLE_CATEGORIES: ArticleCategory[] = [
  'AI Foundations',
  'AI Tools',
  'Engineering',
  'DevOps',
  'Security',
  'InBharat',
];

export type ArticleFaq = { q: string; a: string };

export type ArticleMeta = {
  slug: string;
  title: string;
  /** <=160 char meta description for the shell + OG/Twitter. */
  description: string;
  category: ArticleCategory;
  /** ISO date (YYYY-MM-DD) — feeds TechArticle datePublished. */
  datePublished: string;
  readMinutes: number;
  /** Filename inside ARTICLE_ASSET_DIR; omit to fall back to the branded OG image. */
  visual?: string;
  /** 40–60 word direct-answer paragraph (schema abstract + seoBody + on-page callout). */
  abstract: string;
  faq: ArticleFaq[];
  /** Optional video breakdown — wired but unpopulated in Phase 1 ("Watch on LinkedIn" CTA used instead). */
  videoUrl?: string;
  hashtags?: string[];
};

export const ARTICLES: ArticleMeta[] = [
  {
    slug: 'what-are-ai-agents',
    title: 'AI Agents Aren’t Just Chatbots — They’re the Workforce Multiplier India Needs',
    description:
      'What an AI agent really is, the five agent types, and why autonomous agents matter for Indian engineering teams operating at UPI, Aadhaar, and IRCTC scale.',
    category: 'AI Foundations',
    datePublished: '2026-01-14',
    readMinutes: 8,
    visual: 'what-are-ai-agents.png',
    abstract:
      'An AI agent is an autonomous system that perceives its environment, makes decisions, takes actions with tools and APIs, and learns from outcomes—without a human directing every step. It differs from a chatbot the way an accountant differs from a calculator: one answers questions, the other manages the work.',
    faq: [
      {
        q: 'Is a chatbot the same as an AI agent?',
        a: 'No. A chatbot reacts to prompts you give it. An AI agent acts autonomously—observing, deciding, using tools, and evaluating results without you directing each step.',
      },
      {
        q: 'What are the main types of AI agents?',
        a: 'Five: simple reflex (hard-coded rules), model-based (internal world model), goal-based (plans toward objectives), utility-based (optimizes the best outcome), and learning agents (improve from experience). Production dev agents sit between goal-based and learning.',
      },
      {
        q: 'How are Indian teams using AI agents today?',
        a: 'For code-review triage, test generation and regression, continuous security scanning, and incident response—at UPI/Aadhaar/IRCTC scale where human bandwidth, not talent, is the bottleneck.',
      },
      {
        q: 'What guardrails do autonomous agents need?',
        a: 'Strict access controls, audit trails, human approval gates for high-impact actions, bias monitoring, and explainable logs that satisfy the DPDP Act and RBI requirements.',
      },
    ],
    hashtags: ['InBharat', 'DeshKaAI', 'AIForBharat', 'AIAgents', 'Automation', 'SoftwareDevelopment', 'IndianStartups'],
  },
  {
    slug: 'rag',
    title: 'RAG: How Indian AI Teams Make LLMs Actually Useful',
    description:
      'Retrieval-Augmented Generation grounds LLM answers in your own documents via semantic search. How RAG works, why it matters for Indian compliance and support, and how to build it right.',
    category: 'AI Foundations',
    datePublished: '2026-01-21',
    readMinutes: 8,
    visual: 'rag.png',
    abstract:
      'Retrieval-Augmented Generation (RAG) grounds an LLM’s answers in your own documents. Instead of answering from training data, RAG first retrieves relevant chunks from a vector database using semantic search, then feeds them to the LLM so it generates a response based on real evidence—not memory. This is what stops hallucinations in production.',
    faq: [
      {
        q: 'What does RAG stand for and what problem does it solve?',
        a: 'Retrieval-Augmented Generation. It solves LLM hallucination by retrieving relevant text from your knowledge base first, then generating an answer grounded in that text rather than the model’s training memory.',
      },
      {
        q: 'How does RAG work step by step?',
        a: 'Three stages—ingestion (chunk documents, embed them, store in a vector DB), retrieval (embed the question, find the most similar chunks via semantic search), and generation (send the retrieved chunks + question to the LLM to answer from evidence).',
      },
      {
        q: 'Why does RAG matter for Indian companies?',
        a: 'Indian tax law, state regulations, company policies, and Indian-language terminology are absent from general models. RAG connects LLMs to the actual Indian knowledge—legal, compliance, support, government schemes—they need.',
      },
      {
        q: 'RAG vs fine-tuning—when to use which?',
        a: 'Use RAG when facts change often or you need citations and source control. Use fine-tuning when you need a fixed style, tone, or task behaviour. Many teams use both: fine-tune for style, RAG for facts.',
      },
      {
        q: 'Why do RAG demos fail in production?',
        a: 'Poor chunking splits context across chunks, weak or non-multilingual embeddings miss Indian-language queries, retrieval isn’t evaluated against a test set, and prompts don’t instruct the model to say "I don’t know" when context is empty.',
      },
    ],
    hashtags: ['InBharat', 'DeshKaAI', 'AIForBharat', 'RAG', 'RetrievalAugmentedGeneration', 'LLM', 'AIEngineering', 'IndianTech'],
  },
  {
    slug: 'vibe-coding',
    title: 'Vibe Coding: The Future of Software Development Is Already Here in India',
    description:
      'Vibe coding builds software from natural-language intent. How it works, the tools, the risks, and why it lets Indian domain experts turn ideas into working prototypes in hours.',
    category: 'AI Tools',
    datePublished: '2026-02-04',
    readMinutes: 8,
    visual: 'vibe-coding.png',
    abstract:
      'Vibe coding is building software by describing what you want in natural language while an AI code editor generates, runs, and fixes the code. Coined by Andrej Karpathy, it shifts the developer’s job from writing syntax to directing AI, reviewing output, and making architecture decisions—collapsing the distance between idea and working prototype from months to hours.',
    faq: [
      {
        q: 'What is vibe coding?',
        a: 'A development approach where you describe intent in plain language and an AI editor (Cursor, Copilot Agent mode, Replit, Windsurf) generates multi-file code, runs it, sees errors, and fixes them. You review and iterate through conversation.',
      },
      {
        q: 'Is vibe coding only for non-developers?',
        a: 'No. Senior engineers "vibe code the first draft, then engineer it properly"—generating structure fast, then refactoring, securing, testing, and optimizing. It cuts initial implementation time 40–50%.',
      },
      {
        q: 'What are the risks of vibe coding?',
        a: 'Vibe-coded apps are fragile on edge cases, may include SQL injection or exposed secrets, are hard to debug if you can’t read the generated code, and accumulate technical debt. Every output needs security review before production.',
      },
      {
        q: 'Why does vibe coding matter for India?',
        a: 'India has millions of domain experts—doctors, teachers, farmers—who understand problems but can’t code. Vibe coding lets them build working prototypes to validate ideas before hiring engineers, cutting MVP cost from ₹5–10 lakh to a weekend.',
      },
      {
        q: 'Should vibe-coded code go straight to production?',
        a: 'No. Vibe code for prototypes and first drafts; apply full engineering review—security scanning, code review, testing—for anything production-bound, especially systems handling UPI payments at scale.',
      },
    ],
    hashtags: ['InBharat', 'DeshKaAI', 'AIForBharat', 'VibeCoding', 'AITools', 'Coding', 'NoCode', 'IndianStartups', 'Developers'],
  },
  {
    slug: 'agentic-ai',
    title: 'What Agentic AI Really Means — and Why It Matters for India’s Future',
    description:
      'Agentic AI is autonomous AI that initiates actions and adapts in real time. How it works in layers, the five agent types, and why it lets India scale quality across hundreds of millions of users.',
    category: 'AI Foundations',
    datePublished: '2026-02-18',
    readMinutes: 7,
    visual: 'agentic-ai.png',
    abstract:
      'Agentic AI is autonomous AI—systems that initiate actions, make decisions, and adapt in real time without waiting for you to ask. Where a traditional model reacts to a prompt, an agent wakes up, spots a vulnerability, runs tests, commits a fix, and reports what it did. For India, it’s the key to scaling quality across hundreds of millions of users.',
    faq: [
      {
        q: 'What is agentic AI?',
        a: 'AI that acts autonomously—perceiving context, planning steps, executing with tools, and learning from outcomes without a human directing each move. It’s not just a smarter model; it’s a system that initiates work.',
      },
      {
        q: 'How is agentic AI different from a chatbot or copilot?',
        a: 'A chatbot answers when you ask. A copilot suggests. An agent acts on its own—monitoring, deciding, and executing multi-step workflows, then evaluating the result and adjusting.',
      },
      {
        q: 'What are the layers of an agentic AI system?',
        a: 'Three: architecture/algorithms (process information, make decisions), workflow/process (plan, execute, learn from results), and autonomous action (do it without someone at the keyboard).',
      },
      {
        q: 'Why does agentic AI matter for India?',
        a: 'At UPI, Aadhaar, and IRCTC scale, the bottleneck is human bandwidth, not talent. Agents multiply one engineer’s output—automating code review, testing, security, and incident response so teams serve hundreds of millions consistently.',
      },
      {
        q: 'What oversight does agentic AI require?',
        a: 'Real human oversight, not rubber-stamp approval—transparency on why an agent acted, drift detection, strict access controls, and auditable logs that satisfy RBI and DPDP Act compliance.',
      },
    ],
    hashtags: ['InBharat', 'DeshKaAI', 'AIForBharat', 'AgenticAI', 'IndianAI', 'SoftwareDevelopment'],
  },
  {
    slug: 'prompt-engineering',
    title: 'Prompt Engineering Is a Real Skill — and Indian Developers Who Master It Will Win',
    description:
      'Prompt engineering is writing precise specifications for AI. Core techniques, the India-specific angle, and how to build it as a team capability with a shared prompt library.',
    category: 'AI Tools',
    datePublished: '2026-03-04',
    readMinutes: 8,
    visual: 'prompt-engineering.png',
    abstract:
      'Prompt engineering is the discipline of writing precise instructions that guide an AI model to accurate, useful output. It’s not about being polite to a machine—a prompt is a specification. Techniques like context setting, few-shot examples, chain-of-thought, and role specification turn AI from a frustrating black box into a reliable development partner.',
    faq: [
      {
        q: 'Is prompt engineering just "asking nicely"?',
        a: 'No. A prompt is a specification. Vague input gives vague output; precise context, examples, reasoning steps, and role produce dramatically better results from the same model.',
      },
      {
        q: 'What are the core prompt engineering techniques?',
        a: 'Context setting (stack, requirements, error patterns), few-shot learning (input/output examples), chain-of-thought (reason step by step), and role specification ("act as a senior backend dev for Indian payments").',
      },
      {
        q: 'Why does prompt engineering matter for Indian developers?',
        a: 'The same model gives hardcoded, insecure code from a vague prompt versus production-ready code from a precise one. At ₹40k–1.5L/developer/month, getting usable output on the first try recovers hours daily across a team.',
      },
      {
        q: 'How should teams adopt prompt engineering?',
        a: 'Build a shared, searchable prompt library tagged by use case, review prompts like code, track iterations-to-usable-output (aim under 2), and update practices as model capabilities change.',
      },
      {
        q: 'What’s the India-specific angle?',
        a: 'Specify multilingual needs (Devanagari, Tamil), Indian regulatory context (DPDP Act 2023, UPI), and scale (sharding for 5 crore users). Generic prompts assume American users and infrastructure.',
      },
    ],
    hashtags: ['InBharat', 'DeshKaAI', 'AIForBharat', 'PromptEngineering', 'AITools', 'Developers', 'IndianTech', 'Productivity'],
  },
  {
    slug: 'generative-ai',
    title: 'How Generative AI Is Actually Changing What We Build',
    description:
      'Generative AI creates new content—text, images, audio, code, video—by predicting what comes next. How it works, what it can do, the real costs, and why it matters for India.',
    category: 'AI Foundations',
    datePublished: '2026-03-18',
    readMinutes: 7,
    visual: 'generative-ai.png',
    abstract:
      'Generative AI creates new content—text, images, audio, code, video, 3D—by learning patterns from massive datasets and predicting what comes next. It doesn’t analyze or predict existing data; it produces things that didn’t exist before. For India, it’s the key to creating personalized education, healthcare, and agricultural content at billion-person scale.',
    faq: [
      {
        q: 'What is generative AI?',
        a: 'AI that creates new content—text, images, audio, code, video, or 3D—by learning patterns from large datasets and predicting the next word, pixel, or line. It’s creation, not analysis or prediction.',
      },
      {
        q: 'How does generative AI work?',
        a: 'Training (absorb terabytes of domain data, learn patterns), tuning (specialize on domain-specific data), deployment (respond to prompts), and reinforcement learning (improve from human feedback).',
      },
      {
        q: 'What can generative AI actually produce?',
        a: 'Text (docs, articles, chat), images (mockups, concept art, synthetic training data), code (scaffolding, tests), audio/music, video, and 3D models for VR, prototypes, and digital twins.',
      },
      {
        q: 'Why does generative AI matter for India?',
        a: 'Content creation is the bottleneck across education (500M students), rural healthcare, and agriculture. GenAI creates tutoring content, diagnostic support, and farming guidance in regional languages—not translations, native content.',
      },
      {
        q: 'What are the real costs and risks?',
        a: 'Significant GPU/cloud infrastructure, terabyte-scale data (with privacy and bias risks—biased training data amplifies bias), ethics (deepfakes, misinformation), unresolved copyright questions, and large energy/climate costs.',
      },
    ],
    hashtags: ['InBharat', 'DeshKaAI', 'AIForBharat', 'GenerativeAI', 'IndianAI', 'MachineLearning'],
  },
  {
    slug: 'cicd',
    title: 'CI/CD: The Difference Between Deploying Every Day and Deploying Every Month',
    description:
      'CI/CD automatically builds, tests, and deploys every code change. How the pipeline works, why small frequent deploys are safer, and the security scans that block bad code before production.',
    category: 'Engineering',
    datePublished: '2026-04-01',
    readMinutes: 11,
    visual: 'cicd.png',
    abstract:
      'CI/CD (Continuous Integration / Continuous Deployment) automatically builds, tests, and deploys every code change so teams ship many times a day with low failure rates. CI integrates and tests each change on push; CD deploys passing code to production. The payoff: small, safe, reversible releases instead of risky monthly deployments.',
    faq: [
      {
        q: 'What’s the difference between CI, CD, and continuous deployment?',
        a: 'CI auto-builds and tests every change on push. Continuous Delivery keeps code always release-ready with automated tests. Continuous Deployment auto-releases passing code to users with no manual gate. Most teams do CI/CD; full continuous deployment needs extreme test confidence.',
      },
      {
        q: 'How does a CI/CD pipeline work?',
        a: 'Push to GitHub → automated unit, integration, lint, and security scans → build a tagged artifact (Docker image) → deploy to staging → smoke tests → (manual approval) → production → health monitoring with auto-rollback. ~30 minutes push-to-prod.',
      },
      {
        q: 'Why deploy many times a day?',
        a: 'Small changes are easy to validate and, if they break, easy to trace and roll back. A monthly release of 200 changes makes finding the culprit take hours; a single-line change is obvious. Frequent deployment is safer, not riskier.',
      },
      {
        q: 'What testing belongs in CI/CD?',
        a: 'Fast unit tests for business logic, integration tests for API boundaries, end-to-end tests for critical flows, and smoke tests after deploy. Manual testing stays for UX; most validation is automated and must be fast (under ~15 min) and non-flaky.',
      },
      {
        q: 'What security checks run in CI/CD?',
        a: 'SAST for code-level vulnerabilities, dependency scanning for vulnerable libraries, container scanning for base images, and secret scanning to reject commits with embedded API keys—bad code is blocked before production.',
      },
    ],
    hashtags: ['InBharat', 'DeshKaAI', 'AIForBharat', 'CICD', 'ContinuousIntegration', 'ContinuousDeployment', 'DevOps', 'AutomatedTesting', 'EngineeringExcellence'],
  },
  {
    slug: 'infrastructure-as-code',
    title: 'Infrastructure as Code: Stop Managing Servers Manually Before It Destroys Your Sanity',
    description:
      'IaC defines servers, networks, and databases in version-controlled code. Benefits, declarative vs imperative, disaster recovery, secrets, and the cost wins for Indian AI startups.',
    category: 'DevOps',
    datePublished: '2026-04-15',
    readMinutes: 10,
    visual: 'infrastructure-as-code.png',
    abstract:
      'Infrastructure as Code (IaC) defines your servers, networks, and databases in version-controlled code—Terraform, CloudFormation, Pulumi—instead of clicking through a cloud console. You review it like software, reproduce identical environments, recover from disasters in minutes, and stop the "if Raj gets hit by a bus, our infra dies" single point of failure.',
    faq: [
      {
        q: 'What is Infrastructure as Code?',
        a: 'Defining your infrastructure—servers, networks, databases, monitoring—as version-controlled code (Terraform, CloudFormation, Pulumi) that’s reviewed like software, instead of manually clicking through a cloud console or SSH-ing into boxes.',
      },
      {
        q: 'What problem does IaC solve?',
        a: 'Infrastructure drift—manual changes accumulate, docs go stale, nobody knows the true state, and environments differ. IaC makes infra reproducible, auditable, and recoverable, removing the single engineer who holds the setup in their head.',
      },
      {
        q: 'Declarative vs imperative IaC—what’s the difference?',
        a: 'Declarative (Terraform) describes the desired end state; the tool figures out how. Imperative (Ansible) specifies exact steps. Declarative wins for cloud-native infra; imperative suits legacy configuration. Many teams use both.',
      },
      {
        q: 'How does IaC help disaster recovery?',
        a: 'You run Terraform and rebuild the entire infrastructure in ~30–45 minutes from code, instead of days of manual reconstruction hoping backups are current. Recovery becomes a tested, repeatable operation.',
      },
      {
        q: 'How do you keep secrets out of IaC?',
        a: 'Never commit secrets to Git. Terraform reads database passwords and API keys from a secret manager (AWS Secrets Manager) or environment variables at deploy time; IAM roles handle service auth without keys. State files are stored with versioning and locking.',
      },
    ],
    hashtags: ['InBharat', 'DeshKaAI', 'AIForBharat', 'InfrastructureAsCode', 'Terraform', 'CloudInfrastructure', 'DevOps', 'ScalableArchitecture', 'CloudComputing'],
  },
  {
    slug: 'devsecops',
    title: 'DevSecOps: Making Security the Developer’s Responsibility, Not the Gatekeeper’s',
    description:
      'DevSecOps weaves security into development so it stops being a gatekeeper. Core principles, shift-left, open-source tools, and how Indian teams ship secure features at startup velocity.',
    category: 'Security',
    datePublished: '2026-05-06',
    readMinutes: 9,
    visual: 'devsecops.png',
    abstract:
      'DevSecOps weaves security into development so it stops being a separate gatekeeper team and becomes part of how you build. Everyone owns security; checks run automatically and early (shift left) in the CI/CD pipeline—SAST, dependency scanning, DAST—so Indian teams ship secure features at startup velocity instead of choosing between speed and safety.',
    faq: [
      {
        q: 'What is DevSecOps?',
        a: 'Integrating security throughout development, operations, and deployment so it’s embedded in the workflow rather than a separate gatekeeper team. Everyone owns security; checks are automated and run early and continuously.',
      },
      {
        q: 'Why not just have a security team review before release?',
        a: 'A separate security gate becomes a bottleneck developers work around, and they stop owning security. DevSecOps makes security everyone’s job and automates checks, so you ship secure features at the same velocity—no speed-vs-safety trade-off.',
      },
      {
        q: 'What does "shift left" mean?',
        a: 'Moving security testing earlier in development (the "left" of the timeline) so issues are caught while coding, not after a feature is built. A bug costing ₹1,000 to fix in dev costs ₹1 lakh in production and ₹1 crore after a breach.',
      },
      {
        q: 'What tools do Indian teams use for DevSecOps?',
        a: 'Mostly open-source: GitHub Advanced Security, SonarQube (static analysis), Dependabot (dependency vulns), OWASP ZAP (dynamic testing), and Snyk. Combined, they give comprehensive scanning without enterprise spend.',
      },
      {
        q: 'How do you start with DevSecOps?',
        a: 'Add automated security scanning to your CI/CD pipeline, block merges on critical findings, train developers on secure coding, make security part of code review, track vulnerabilities found and time-to-fix, and celebrate security wins.',
      },
    ],
    hashtags: ['InBharat', 'DeshKaAI', 'AIForBharat', 'DevSecOps', 'ApplicationSecurity', 'SecurityAutomation', 'SoftwareDevelopment', 'CyberSecurity'],
  },
  {
    slug: 'supply-chain-security',
    title: 'The Invisible Risk Inside Your Code: Software Supply Chain Security for India’s Tech Leaders',
    description:
      'Your app rests on hundreds of dependencies and build tools—each a target. SBOMs, dependency scanning, signed commits, and locked-down pipelines that catch compromise before production.',
    category: 'Security',
    datePublished: '2026-05-20',
    readMinutes: 8,
    visual: 'supply-chain-security.png',
    abstract:
      'Software supply chain security protects your product from malicious code slipping in through dependencies and build tools you didn’t write. Your app rests on hundreds of libraries, CI runners, and package registries—each a target. Practices like SBOM generation, dependency scanning, signed commits, and locked-down pipelines catch compromise before it reaches production.',
    faq: [
      {
        q: 'What is software supply chain security?',
        a: 'Managing every dependency and build tool your software relies on so an attacker can’t slip malicious code into your product through a component you didn’t write—covering source integrity, dependency management, secure builds, and access control.',
      },
      {
        q: 'What is an SBOM and why do I need one?',
        a: 'A Software Bill of Materials—a complete, machine-generated list of every dependency in your app (often 500+). Tools like CycloneDX scan your codebase so you actually know what you’re running and can scan it for known vulnerabilities.',
      },
      {
        q: 'What are common supply chain attacks?',
        a: 'Malicious code hidden in popular npm/PyPI packages, compromised CI build tools that silently steal secrets, typosquatting (installing "reqeusts" instead of "requests"), outdated dependencies with known exploits, and credentials accidentally committed to GitHub.',
      },
      {
        q: 'How does a small startup implement this?',
        a: 'Generate an SBOM (CycloneDX), scan dependencies (Snyk/Dependabot) with auto-PRs to patched versions, require SBOMs from vendors, lock down builds (branch protection, signed commits, environment-specific secrets), and do quarterly dependency audits. ~1–2 weeks of work.',
      },
      {
        q: 'Why does supply chain security matter for Indian startups?',
        a: 'Indian fintech and edtech are targets for nation-state and criminal actors, but have small teams that can’t audit every library. Automated supply chain controls catch problems at scale without a security army—and protect the global clients who rely on Indian-built code.',
      },
    ],
    hashtags: ['InBharat', 'DeshKaAI', 'AIForBharat', 'Security', 'SupplyChainSecurity', 'Cybersecurity', 'DeveloperSecurity', 'DevSecOps', 'IndianTech', 'FinTech'],
  },
  {
    slug: 'inbharat-ecosystem',
    title: '12 Products, One Mission: The InBharat.ai Story',
    description:
      'Why InBharat builds an ecosystem of twelve connected AI products—agentic search, interactive storybooks, a company OS, a personal AI OS, a field health app, education tools, a WhatsApp bot, decision intelligence, agent observability, social automation, and a developer installer—for India’s interlocked problems.',
    category: 'InBharat',
    datePublished: '2026-06-03',
    readMinutes: 7,
    visual: 'inbharat-ecosystem.png',
    abstract:
      'The InBharat.ai ecosystem is a portfolio of twelve interconnected AI products—agentic search, interactive storybooks, a company OS, a personal AI OS, a field health app, education tools, a WhatsApp bot, decision intelligence, agent observability, social automation, and a developer installer—built for India because Indian problems are interlocked: a farmer needs credit, market info, and learning together. One product can’t serve those needs; twelve that share an identity and data layer can.',
    faq: [
      {
        q: 'Why build twelve products instead of focusing on one?',
        a: 'India’s problems are interconnected—a farmer needs credit, market access, and learning together; a student needs stories, guidance, test prep, and a bot that answers at midnight. Serving one need in isolation doesn’t work in India. An ecosystem of connected products serves the same user across a decade of needs.',
      },
      {
        q: 'What are the twelve products in the InBharat ecosystem?',
        a: 'InBharat AI (agentic search), KathaKitaab (interactive storybooks), JAK Swarm (company OS), Sahaayak AI (personal AI OS), SahaayakSeva (field health app), UniAssist.ai (admissions guidance), TestsPrep.in (exam prep), UniBot (WhatsApp bot), Phoring (decision intelligence), Agent Arcade (agent observability), SocialFlow (social automation), and OpenClawFix (developer installer)—all built for Indian context and constraints.',
      },
      {
        q: 'How do the products connect?',
        a: 'A shared, consent-based identity layer (one user across all products), a shared data layer where models learn across the full scope of Indian life, and shared local-first infrastructure—data and processing stay in India—so the search agent understands the education context, the health app understands the local language, and so on.',
      },
      {
        q: 'Isn’t a multi-product approach unfocused?',
        a: 'It’s the defensible model. A single product going global gets absorbed competing with American companies on their terms. An ecosystem built deeply for India—like Alibaba for China—is hard to compete with because it’s built for problems American companies don’t understand.',
      },
      {
        q: 'What’s the current state of the ecosystem?',
        a: 'Shipping, not vision—InBharat AI, KathaKitaab, JAK Swarm, SahaayakSeva, UniAssist.ai, TestsPrep.in, UniBot, Phoring, Agent Arcade, SocialFlow, and OpenClawFix are all live and usable now. It’s being built right now, not on a five-year roadmap.',
      },
    ],
    hashtags: ['InBharat', 'DeshKaAI', 'AIForBharat', 'IndianStartup', 'AIEcosystem', 'BuildingBharat'],
  },
  {
    slug: 'desh-ka-ai',
    title: 'Desh Ka AI: What It Means to Build for Bharat',
    description:
      'Desh Ka AI is AI built in India, for India, by Indians—not "sovereign AI" but open, private-sector-led, and globally competitive. What makes AI Desh Ka and why it’s a global advantage.',
    category: 'InBharat',
    datePublished: '2026-06-17',
    readMinutes: 8,
    visual: 'desh-ka-ai.png',
    abstract:
      'Desh Ka AI means AI built in India, for India, by Indians—trained on Indian data, in Indian languages, for Indian constraints, and owned by Indians. It’s not "sovereign AI" (closed, government-controlled) but open, private-sector-led, and globally competitive: solving Indian problems so well that the solutions export to the Global South.',
    faq: [
      {
        q: 'What does "Desh Ka AI" mean?',
        a: '"Country’s AI"—AI built in India, for India, by Indians: trained on Indian data, in Indian languages, designed for Indian constraints (payments, regulation, climate, infrastructure), and owned by Indians, with India as the primary market.',
      },
      {
        q: 'How is Desh Ka AI different from "sovereign AI"?',
        a: 'Sovereign implies closed, government-controlled, and an alternative to American AI. Desh Ka AI is open, private-sector-led, collaborates globally, and is a complement—you use Indian AI when it’s best for Indian problems, American AI when it’s best.',
      },
      {
        q: 'What makes AI genuinely "Desh Ka"?',
        a: 'Built with Indian data (not translated), in Indian languages (22 official scripts), for Indian constraints (UPI, DPDP Act, monsoon farming, one doctor per 1,000 people), owned by Indians, and designed for Indian users as the primary market—not an afterthought.',
      },
      {
        q: 'Is Desh Ka AI only for India?',
        a: 'No—it’s a global advantage. A model trained on 1.4 billion people, a healthcare AI for tropical and resource-constrained settings, an agricultural AI for monsoon farming—these solve problems for billions across the Global South that American AI doesn’t touch.',
      },
      {
        q: 'Why is Desh Ka AI defensible?',
        a: 'It’s built for problems American companies don’t understand and won’t prioritize. Solving rural healthcare or no-credit-history finance for hundreds of millions of Indians creates value and expertise that’s hard to replicate—and exports to similar markets worldwide.',
      },
    ],
    hashtags: ['InBharat', 'DeshKaAI', 'AIForBharat', 'IndianLeadership', 'BuildingAI', 'BharatPehle'],
  },
  {
    slug: 'harness-engineering',
    title: 'Harness Engineering: Building Safe and Reliable AI Agent Systems',
    description:
      'Learn how harness engineering secures AI agents in production, featuring a deep dive into the JAKSwarm.com orchestration and risk-gate architecture.',
    category: 'Engineering',
    datePublished: '2026-06-27',
    readMinutes: 7,
    visual: 'harness-engineering.png',
    abstract:
      'Harness engineering is the practice of wrapping autonomous AI agents in structured, deterministic software wrappers—or harnesses—to control execution, validate outputs, and manage risks. By decoupling raw LLM generation from execution gates, engineers ensure that agentic workflows remain predictable, secure, and fully auditable in high-stakes production environments.',
    faq: [
      {
        q: 'What is Harness Engineering in the context of AI agents?',
        a: 'Harness engineering is the practice of building deterministic software wrappers around non-deterministic AI agents. It intercepts, validates, monitors, and controls the inputs, outputs, and tool executions of LLMs to ensure they operate within safe, predictable parameters.',
      },
      {
        q: 'How does JAKSwarm.com implement a production-grade agent harness?',
        a: 'JAKSwarm.com acts as an evidence engine and agent-orchestration platform. It wraps agents behind the JAK Shield risk gate, tracking actions in an evidence graph, managing execution, and using drift detection to ensure agents do not deviate from their intended operational boundaries.',
      },
      {
        q: 'Why is a risk gate like JAK Shield necessary for enterprise AI?',
        a: 'A risk gate acts as a final, deterministic firewall. Even if an LLM generates an incorrect or unsafe instruction, the risk gate intercepts the command, evaluates it against strict safety policies, and blocks execution before any real-world harm or system corruption occurs.',
      },
      {
        q: 'How does drift detection protect AI agents over time?',
        a: 'Drift detection monitors agent behavior, prompt performance, and LLM output distributions over time. If an underlying model update or a change in user data causes the agent’s actions to shift away from established safety and accuracy baselines, the harness flags the system for review.',
      },
      {
        q: 'How does harness engineering apply to critical sectors like Indian healthcare?',
        a: 'In critical services like Sahayaak Seva, a harness ensures that AI-driven triage or administrative agents cannot bypass human-in-the-loop validation or violate medical safety guidelines, so every AI recommendation is backed by verifiable clinical evidence before deployment.',
      },
    ],
    hashtags: ['InBharat', 'DeshKaAI', 'HarnessEngineering', 'AIAgents', 'SoftwareEngineering', 'LLMOps', 'TechIndia'],
  },
  {
    slug: 'neural-networks-the-core-of-practical-ai-for-indian-engineer',
    title: 'Neural Networks: The Core of Practical AI for Indian Engineers',
    description: 'Reeturaj Goswami explains how neural networks power AI, why Indian engineers need to understand them for practical deployment, and how to build and optimize AI ',
    category: 'AI Foundations',
    datePublished: '2026-06-28',
    readMinutes: 5,
    visual: 'neural-networks-the-core-of-practical-ai-for-indian-engineer.png',
    abstract: 'Neural networks are the engine behind most AI, and understanding them is crucial for Indian engineers. This article, from InBharat.ai founder Reeturaj Goswami, demystifies their operation, highlights their practical application for Indian use cases, and emphasizes deployment optimization for local constraints like latency and cost. It\'s about building effective, scalable AI for India.',
    faq: [],
    hashtags: [],
  },
  {
    slug: 'fine-tuning-vs-rag-when-to-use-each-for-your-indian-ai-produ',
    title: 'Fine-Tuning vs. RAG: When to Use Each for Your Indian AI Product',
    description: 'Navigating fine-tuning vs. RAG for your AI product in India? This guide by InBharat AI founder Reeturaj Goswami breaks down the practical considerations.',
    category: 'AI Foundations',
    datePublished: '2026-06-29',
    readMinutes: 7,
    abstract: 'Choosing between fine-tuning and Retrieval Augmented Generation (RAG) is a common dilemma for Indian AI teams. While fine-tuning offers deep customization, RAG is often more cost-effective and agile for dynamic data, making it the default choice for most applications unless specific style, latency, or nuanced domain understanding demands fine-tuning.',
    faq: [
      { q: 'Can I use both fine-tuning and RAG together?', a: 'Yes, a hybrid approach is often powerful. You could fine-tune an LLM to adopt a specific tone or to excel at a particular task (like summarization or entity extraction) and then use RAG to provide it with up-to-date, factual information from your knowledge base. This combines the best of both worlds: specialized model behavior with dynamic, grounded knowledge.' },
      { q: 'Which approach is better for handling multiple Indian languages?', a: 'RAG is generally more flexible for multilingual support. You can index documents in various Indian languages in your vector database, and the LLM (if it\'s a multilingual model) can retrieve and respond in the appropriate language. Fine-tuning for multiple languages requires substantial, high-quality parallel data for each language, which can be very expensive and time-consuming to acquire and label in India.' },
      { q: 'What are the hidden costs of fine-tuning that Indian startups should be aware of?', a: 'Beyond the direct GPU costs for training, hidden costs include data collection and cleaning (especially for regional languages), data annotation, ongoing maintenance if your domain changes (requiring re-fine-tuning), and the expertise needed to manage and evaluate fine-tuning experiments. RAG, while requiring infrastructure for retrieval, often has lower recurring costs for knowledge updates.' },
    ],
    hashtags: ['AIinIndia', 'LLMs', 'RAG', 'FineTuning', 'InBharatAI'],
  },
];

export function getArticleBySlug(slug: string): ArticleMeta | undefined {
  return ARTICLES.find((a) => a.slug === slug);
}

/** Absolute site path for an article (used by routing + links). */
export function articlePath(slug: string): string {
  return `${ARTICLE_HUB_PATH}/${slug}`;
}

/** OG/hero image path; falls back to the branded OG image when no visual is set. */
export function articleVisualPath(meta: ArticleMeta): string {
  return meta.visual ? `${ARTICLE_ASSET_DIR}/${meta.visual}` : '/og-image.png';
}

/** Up to `n` related articles: same category first, then siblings. Never includes `meta`. */
export function getRelatedArticles(meta: ArticleMeta, n = 3): ArticleMeta[] {
  const sameCategory = ARTICLES.filter(
    (a) => a.category === meta.category && a.slug !== meta.slug,
  );
  const others = ARTICLES.filter(
    (a) => a.category !== meta.category && a.slug !== meta.slug,
  );
  return [...sameCategory, ...others].slice(0, n);
}

/** Stable prev/next across the manifest order (wraps around). */
export function getPrevNextArticles(meta: ArticleMeta): {
  prev: ArticleMeta;
  next: ArticleMeta;
} {
  const idx = ARTICLES.findIndex((a) => a.slug === meta.slug);
  const prevIdx = (idx - 1 + ARTICLES.length) % ARTICLES.length;
  const nextIdx = (idx + 1) % ARTICLES.length;
  return { prev: ARTICLES[prevIdx], next: ARTICLES[nextIdx] };
}