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
  /** Known first-publication date; omit when not independently established. */
  datePublished?: string;
  /** Repository snapshot preparation timestamp, never proof of live publication. */
  repositoryRecordedAt?: string;
  /** Actual content correction date; never a build/republish timestamp. */
  dateModified?: string;
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
    "slug": "what-are-ai-agents",
    "title": "AI Agents Aren’t Just Chatbots — They’re the Workforce Multiplier India Needs",
    "description": "AI agents explained: bounded tool use, planning, outcome checks and oversight, without automatic-learning or national-scale deployment claims.",
    "category": "AI Foundations",
    "datePublished": "2026-01-14",
    "readMinutes": 7,
    "visual": "what-are-ai-agents.png",
    "abstract": "An AI agent uses context, planning and permitted tools to pursue a goal and check outcomes. Some agents operate from authorized triggers; others begin with a user request. Learning from experience is a separate capability, not a requirement or guaranteed improvement. Safe use depends on clear scope, permissions, oversight and evaluation.",
    "faq": [
      {
        "q": "Is a chatbot the same as an AI agent?",
        "a": "No. A chatbot reacts to prompts you give it. An AI agent acts autonomously—observing, deciding, using tools, and evaluating results without you directing each step."
      },
      {
        "q": "What are the main types of AI agents?",
        "a": "Five: simple reflex (hard-coded rules), model-based (internal world model), goal-based (plans toward objectives), utility-based (optimizes the best outcome), and learning agents (improve from experience). A deployed agent need not learn new weights; its capabilities depend on its design."
      },
      {
        "q": "How are Indian teams using AI agents today?",
        "a": "Potential uses include code-review triage, test generation, security checks and incident support. No deployment at national-service scale or quantified productivity improvement is established here."
      },
      {
        "q": "What guardrails do autonomous agents need?",
        "a": "Strict access controls, audit trails, human approval gates for high-impact actions, bias monitoring, and reviewable logs and a separate assessment of applicable data-protection and RBI requirements."
      }
    ],
    "hashtags": [
      "InBharat",
      "DeshKaAI",
      "AIForBharat",
      "AIAgents",
      "Automation",
      "SoftwareDevelopment",
      "IndianStartups"
    ],
    "dateModified": "2026-11-16"
  },
  {
    "slug": "rag",
    "title": "RAG: How Indian AI Teams Make LLMs Actually Useful",
    "description": "Retrieval-Augmented Generation grounds LLM answers in your own documents via semantic search. How RAG works, why it matters for Indian compliance and support, and how to build it right.",
    "category": "AI Foundations",
    "datePublished": "2026-01-21",
    "readMinutes": 7,
    "visual": "rag.png",
    "abstract": "Retrieval-Augmented Generation supplies retrieved sources to a model at inference time. It can improve grounding and citations but does not eliminate hallucinations, stale information or access-control failures. Retrieval may use keyword, vector or hybrid search; evaluate source relevance and answer faithfulness separately.",
    "faq": [
      {
        "q": "What does RAG stand for and what problem does it solve?",
        "a": "Retrieval-Augmented Generation. It can reduce unsupported answers by retrieving relevant text from your knowledge base first, then generating an answer grounded in that text rather than the model's training memory."
      },
      {
        "q": "How does RAG work step by step?",
        "a": "Three stages—ingestion (chunk documents, embed them, store in a vector DB), retrieval (embed the question, find the most similar chunks via semantic search), and generation (send the retrieved chunks + question to the LLM to answer from evidence)."
      },
      {
        "q": "Why does RAG matter for Indian companies?",
        "a": "Indian tax law, state regulations, company policies, and Indian-language terminology may be incomplete or outdated in general models. RAG connects LLMs to the actual Indian knowledge—legal, compliance, support, government schemes—they need."
      },
      {
        "q": "RAG vs fine-tuning—when to use which?",
        "a": "Use RAG when facts change often or you need citations and source control. Use fine-tuning when you need a fixed style, tone, or task behaviour. Many teams use both: fine-tune for style, RAG for facts."
      },
      {
        "q": "Why do RAG demos fail in production?",
        "a": "Poor chunking splits context across chunks, weak or non-multilingual embeddings miss Indian-language queries, retrieval isn't evaluated against a test set, and prompts don't instruct the model to say \"I don't know\" when context is empty."
      }
    ],
    "hashtags": [
      "InBharat",
      "DeshKaAI",
      "AIForBharat",
      "RAG",
      "RetrievalAugmentedGeneration",
      "LLM",
      "AIEngineering",
      "IndianTech"
    ],
    "dateModified": "2026-11-16"
  },
  {
    "slug": "vibe-coding",
    "title": "Vibe Coding: The Future of Software Development Is Already Here in India",
    "description": "Natural-language software prototyping, its practical limits, and the engineering review required before production.",
    "category": "AI Tools",
    "datePublished": "2026-02-04",
    "readMinutes": 7,
    "visual": "vibe-coding.png",
    "abstract": "Vibe coding uses natural-language direction to generate and iterate on software, often for prototypes. Professional AI-assisted development adds deliberate review, architecture, testing and maintenance. Time and cost savings vary; a working demo is not evidence of secure, reliable production software.",
    "faq": [
      {
        "q": "What is vibe coding?",
        "a": "A development approach where you describe intent in plain language and an AI editor can propose code and, with suitable tools and permissions, run checks and suggest fixes. You review and iterate through conversation; generated changes still need testing."
      },
      {
        "q": "Is vibe coding only for non-developers?",
        "a": "No. Senior engineers \"vibe code the first draft, then engineer it properly\"—generating structure fast, then refactoring, securing, testing, and optimizing. The saving depends on the task and the review and rework it requires."
      },
      {
        "q": "What are the risks of vibe coding?",
        "a": "Vibe-coded apps can fail on edge cases, include SQL injection or exposed secrets, and accumulate technical debt. Debugging is harder when you cannot read the generated code. Every output needs security review and tests before production."
      },
      {
        "q": "Why does vibe coding matter for India?",
        "a": "India has many domain experts—doctors, teachers, farmers—who understand problems but do not write software. AI-assisted prototyping may help them communicate requirements and test an idea before a larger engineering investment. It does not establish a fixed MVP cost, delivery time or saving."
      },
      {
        "q": "Should vibe-coded code go straight to production?",
        "a": "No. Vibe code for prototypes and first drafts; apply full engineering review—security scanning, code review, testing—for anything production-bound, especially systems handling UPI payments at scale."
      }
    ],
    "hashtags": [
      "InBharat",
      "DeshKaAI",
      "AIForBharat",
      "VibeCoding",
      "AITools",
      "Coding",
      "NoCode",
      "IndianStartups",
      "Developers"
    ],
    "dateModified": "2026-11-16"
  },
  {
    "slug": "agentic-ai",
    "title": "What Agentic AI Really Means — and Why It Matters for India’s Future",
    "description": "Agentic AI uses planning, tools and feedback within defined permissions. Learn the architecture, human oversight and limits of useful autonomy.",
    "category": "AI Foundations",
    "datePublished": "2026-02-18",
    "readMinutes": 6,
    "visual": "agentic-ai.png",
    "abstract": "Agentic AI systems plan and execute bounded workflows using tools and feedback. They may start from a user request or an authorized trigger; they do not inherently learn new model weights after every task. Useful autonomy requires permission boundaries, outcome checks, budgets, monitoring and human review for consequential actions.",
    "faq": [
      {
        "q": "What is agentic AI?",
        "a": "AI that pursues goals through context, planning, permitted tools and outcome checks without a human directing each low-level step; learning new model weights is optional and separate. It's not just a smarter model; it's a system that initiates work."
      },
      {
        "q": "How is agentic AI different from a chatbot or copilot?",
        "a": "A chatbot answers when you ask. A copilot suggests. An agent acts on its own—monitoring, deciding, and executing multi-step workflows, then evaluating the result and adjusting."
      },
      {
        "q": "What are the layers of an agentic AI system?",
        "a": "Three: architecture/algorithms (process information, make decisions), workflow/process (plan, execute, learn from results), and autonomous action (do it without someone at the keyboard)."
      },
      {
        "q": "Why does agentic AI matter for India?",
        "a": "Bounded automation can help with code review, testing, security checks and incident support. Teams must measure quality and review effort; no national-scale deployment or fixed productivity multiplier is claimed."
      },
      {
        "q": "What oversight does agentic AI require?",
        "a": "Real human oversight, not rubber-stamp approval—transparency on why an agent acted, drift detection, strict access controls, and auditable logs that support review against applicable RBI and data-protection obligations; logs alone do not establish compliance."
      }
    ],
    "hashtags": [
      "InBharat",
      "DeshKaAI",
      "AIForBharat",
      "AgenticAI",
      "IndianAI",
      "SoftwareDevelopment"
    ],
    "dateModified": "2026-11-16"
  },
  {
    "slug": "prompt-engineering",
    "title": "Prompt Engineering Is a Real Skill — and Indian Developers Who Master It Will Win",
    "description": "Prompt engineering is writing precise specifications for AI. Core techniques, the India-specific angle, and how to build it as a team capability with a shared prompt library.",
    "category": "AI Tools",
    "datePublished": "2026-03-04",
    "readMinutes": 7,
    "visual": "prompt-engineering.png",
    "abstract": "Prompt engineering specifies context, task boundaries, examples and output requirements to improve model responses. Better prompts can help, but cannot guarantee correct, secure or compliant output. Evaluate prompts against representative cases, and apply code review, tests and domain expertise before consequential use.",
    "faq": [
      {
        "q": "Is prompt engineering just \"asking nicely\"?",
        "a": "No. A prompt is a specification. Vague input gives vague output; precise context, examples, reasoning steps, and role produce dramatically better results from the same model."
      },
      {
        "q": "What are the core prompt engineering techniques?",
        "a": "Context setting (stack, requirements, error patterns), few-shot learning (input/output examples), chain-of-thought (reason step by step), and role specification (\"act as a senior backend dev for Indian payments\")."
      },
      {
        "q": "Why does prompt engineering matter for Indian developers?",
        "a": "The same model gives hardcoded, insecure code from a vague prompt versus a more relevant draft from a precise one; neither should bypass review. Measure time to a reviewed result rather than assuming a fixed salary-based saving."
      },
      {
        "q": "How should teams adopt prompt engineering?",
        "a": "Build a shared, searchable prompt library tagged by use case, review prompts like code, track iterations-to-usable-output (aim under 2), and update practices as model capabilities change."
      },
      {
        "q": "What's the India-specific angle?",
        "a": "Specify multilingual needs (Devanagari, Tamil), Indian regulatory context (DPDP Act 2023, UPI), and scale (sharding for 5 crore users). Generic prompts assume American users and infrastructure."
      }
    ],
    "hashtags": [
      "InBharat",
      "DeshKaAI",
      "AIForBharat",
      "PromptEngineering",
      "AITools",
      "Developers",
      "IndianTech",
      "Productivity"
    ],
    "dateModified": "2026-11-16"
  },
  {
    "slug": "generative-ai",
    "title": "How Generative AI Is Actually Changing What We Build",
    "description": "Generative AI creates new content—text, images, audio, code, video—by predicting what comes next. How it works, what it can do, the real costs, and why it matters for India.",
    "category": "AI Foundations",
    "datePublished": "2026-03-18",
    "readMinutes": 6,
    "visual": "generative-ai.png",
    "abstract": "Generative AI produces text, images, audio, code and other content using learned statistical patterns. Methods differ by modality; generation can involve prediction and does not guarantee originality or truth. Models can memorize data, and deployed inference does not automatically retrain them. Health and other consequential uses need domain-specific validation.",
    "faq": [
      {
        "q": "What is generative AI?",
        "a": "AI that creates new content—text, images, audio, code, video, or 3D—by learning patterns from large datasets and predicting the next word, pixel, or line. It focuses on generation, often using predictive methods; factuality and originality are not guaranteed."
      },
      {
        "q": "How does generative AI work?",
        "a": "Training (absorb terabytes of domain data, learn patterns), tuning (specialize on domain-specific data), deployment (respond to prompts), and optional separate feedback-based training. Inference alone does not continuously train the model."
      },
      {
        "q": "What can generative AI actually produce?",
        "a": "Text (docs, articles, chat), images (mockups, concept art, synthetic training data), code (scaffolding, tests), audio/music, video, and 3D models for VR, prototypes, and digital twins."
      },
      {
        "q": "Why does generative AI matter for India?",
        "a": "Content creation is the bottleneck across education, rural healthcare, and agriculture. GenAI creates tutoring content, diagnostic support, and farming guidance in regional languages—not translations, native content."
      },
      {
        "q": "What are the real costs and risks?",
        "a": "Significant GPU/cloud infrastructure, terabyte-scale data (with privacy and bias risks—biased training data amplifies bias), ethics (deepfakes, misinformation), unresolved copyright questions, and large energy/climate costs."
      }
    ],
    "hashtags": [
      "InBharat",
      "DeshKaAI",
      "AIForBharat",
      "GenerativeAI",
      "IndianAI",
      "MachineLearning"
    ],
    "dateModified": "2026-11-16"
  },
  {
    "slug": "cicd",
    "title": "CI/CD: The Difference Between Deploying Every Day and Deploying Every Month",
    "description": "CI, continuous delivery and continuous deployment explained, with artifact promotion, scoped test gates, monitoring and rehearsed recovery.",
    "category": "Engineering",
    "datePublished": "2026-04-01",
    "readMinutes": 3,
    "visual": "cicd.png",
    "abstract": "CI builds and tests changes; continuous delivery keeps a release ready for approval; continuous deployment releases passing changes automatically. Small artifacts, staged rollout, monitoring and rehearsed recovery can reduce release risk. Results depend on test coverage, infrastructure and change type, not a guaranteed failure rate or deployment time.",
    "faq": [
      {
        "q": "What is the difference between CI, delivery and deployment?",
        "a": "CI integrates and tests changes. Continuous delivery keeps a release ready for approval. Continuous deployment automatically releases changes that meet a defined policy."
      },
      {
        "q": "Does a passing pipeline guarantee a safe release?",
        "a": "No. Tests and scanners cover defined cases; staging, approval, monitoring and recovery controls address additional risks."
      },
      {
        "q": "How long should a pipeline take?",
        "a": "Measure it for the project. Parallelize independent checks and remove waste without dropping critical validation; no fixed push-to-production time is promised."
      },
      {
        "q": "Can every change be rolled back?",
        "a": "No. Database changes and external side effects may require a roll-forward or recovery procedure. Rehearse the relevant paths before relying on them."
      }
    ],
    "hashtags": [
      "InBharat",
      "DeshKaAI",
      "AIForBharat",
      "CICD",
      "ContinuousIntegration",
      "ContinuousDeployment",
      "DevOps",
      "AutomatedTesting",
      "EngineeringExcellence"
    ],
    "dateModified": "2026-11-16"
  },
  {
    "slug": "infrastructure-as-code",
    "title": "Infrastructure as Code: Stop Managing Servers Manually Before It Destroys Your Sanity",
    "description": "Infrastructure as Code for repeatable provisioning: resource state, tool choices, secret handling, drift and tested recovery.",
    "category": "DevOps",
    "datePublished": "2026-04-15",
    "readMinutes": 3,
    "visual": "infrastructure-as-code.png",
    "abstract": "Infrastructure as Code expresses infrastructure in version-controlled configuration or programs. It supports repeatable provisioning, review and drift detection, but does not guarantee identical environments, instant recovery or a fixed cost reduction. Terraform state and plans may contain secrets; disaster recovery also depends on backups and tested restoration.",
    "faq": [
      {
        "q": "What is Infrastructure as Code?",
        "a": "Version-controlled definitions of infrastructure that teams can review, plan and apply using tools such as Terraform, CloudFormation, Ansible and Pulumi."
      },
      {
        "q": "Does rerunning Terraform create another server?",
        "a": "Normally it reconciles the existing managed resource. Additional servers require a configuration change requesting additional resources."
      },
      {
        "q": "Does IaC guarantee fast disaster recovery?",
        "a": "No. Provisioning is one part; data restore, credentials, dependencies and application checks must also be tested and timed."
      },
      {
        "q": "Does a secret manager keep secrets out of Terraform state?",
        "a": "Not necessarily. Values can still be stored in state or plans. Protect those artifacts and use version-appropriate secret-handling features."
      }
    ],
    "hashtags": [
      "InBharat",
      "DeshKaAI",
      "AIForBharat",
      "InfrastructureAsCode",
      "Terraform",
      "CloudInfrastructure",
      "DevOps",
      "ScalableArchitecture",
      "CloudComputing"
    ],
    "dateModified": "2026-11-16"
  },
  {
    "slug": "devsecops",
    "title": "DevSecOps: Making Security the Developer’s Responsibility, Not the Gatekeeper’s",
    "description": "Integrate security into development with automated checks, shared responsibility and specialist review, without zero-incident guarantees.",
    "category": "Security",
    "datePublished": "2026-05-06",
    "readMinutes": 3,
    "visual": "devsecops.png",
    "abstract": "DevSecOps integrates security responsibilities and checks throughout development and operations. Early testing, dependency review, secure design and incident learning can reduce risk and rework. Automated scanners have limited coverage, and high-risk changes still require expert review; no zero-incident or same-speed guarantee follows.",
    "faq": [
      {
        "q": "What is DevSecOps?",
        "a": "Shared security work throughout design, development, deployment and operation, supported by automation and expert review."
      },
      {
        "q": "Does it eliminate a security release gate?",
        "a": "No. Earlier checks can reduce late surprises, while high-risk changes and unresolved findings may still require specialist approval."
      },
      {
        "q": "Does shift-left always make development faster?",
        "a": "No. It aims to find problems earlier and reduce rework, but necessary security work takes time and outcomes vary."
      },
      {
        "q": "Are all the commonly named tools free and open-source?",
        "a": "No. Licensing, private-repository access and advanced features vary by tool, edition and plan."
      }
    ],
    "hashtags": [
      "InBharat",
      "DeshKaAI",
      "AIForBharat",
      "DevSecOps",
      "ApplicationSecurity",
      "SecurityAutomation",
      "SoftwareDevelopment",
      "CyberSecurity"
    ],
    "dateModified": "2026-11-16"
  },
  {
    "slug": "supply-chain-security",
    "title": "The Invisible Risk Inside Your Code: Software Supply Chain Security for India’s Tech Leaders",
    "description": "Dependency inventory, provenance, secure builds and access controls: practical supply-chain risk reduction and its limits.",
    "category": "Security",
    "datePublished": "2026-05-20",
    "readMinutes": 8,
    "visual": "supply-chain-security.png",
    "abstract": "Software supply-chain security combines dependency inventory, vulnerability review, build isolation, provenance and access controls. SBOMs help identify components, while signatures help authenticate artifacts or commits. Neither guarantees safe code or complete vulnerability detection; controls need ongoing review and project-specific validation.",
    "faq": [
      {
        "q": "What is software supply chain security?",
        "a": "Managing every dependency and build tool your software relies on to reduce the chance of malicious code entering your product through a component you didn't write—covering source integrity, dependency management, secure builds, and access control."
      },
      {
        "q": "What is an SBOM and why do I need one?",
        "a": "A Software Bill of Materials—an inventory of software components, often generated automatically. Completeness depends on tooling and build scope. Tools that generate the CycloneDX SBOM format inspect your dependency inventory so you actually know what you're running and can scan it for known vulnerabilities."
      },
      {
        "q": "What are common supply chain attacks?",
        "a": "Malicious code hidden in popular npm/PyPI packages, compromised CI build tools that silently steal secrets, typosquatting (installing \"reqeusts\" instead of \"requests\"), outdated dependencies with known exploits, and credentials accidentally committed to GitHub."
      },
      {
        "q": "How does a small startup implement this?",
        "a": "Generate an SBOM (CycloneDX), scan dependencies (Snyk/Dependabot) with auto-PRs to patched versions, require SBOMs from vendors, lock down builds (branch protection, signed commits, environment-specific secrets), and do quarterly dependency audits. Scope effort to the project and maintain the controls continuously."
      },
      {
        "q": "Why does supply chain security matter for Indian startups?",
        "a": "Indian fintech and edtech are targets for nation-state and criminal actors, but have small teams that can't audit every library. Automated supply chain controls catch problems at scale without a security army—and protect the global clients who rely on Indian-built code."
      }
    ],
    "hashtags": [
      "InBharat",
      "DeshKaAI",
      "AIForBharat",
      "Security",
      "SupplyChainSecurity",
      "Cybersecurity",
      "DeveloperSecurity",
      "DevSecOps",
      "IndianTech",
      "FinTech"
    ],
    "dateModified": "2026-11-16"
  },
  {
    "slug": "inbharat-ecosystem",
    "title": "The InBharat.ai Ecosystem: A Historical Twelve-Product Portfolio",
    "description": "The historical twelve-product portfolio, today’s PAI/UnoOne flagship, and clear boundaries around integration, data processing and deployment claims.",
    "category": "InBharat",
    "datePublished": "2026-06-03",
    "readMinutes": 4,
    "visual": "inbharat-ecosystem.png",
    "abstract": "This article records InBharat.ai’s historical twelve-product portfolio; the current directory contains fifteen entries. PAI is the current personal private agent, implemented through UnoOne Power and UnoOne Mobile. Shared engineering goals do not establish shared identity, Aadhaar integration, cross-product personal-data access, India-only processing or verified field deployments.",
    "faq": [
      {
        "q": "Why does this article describe twelve products while the directory lists fifteen?",
        "a": "Twelve is the historical June 2026 portfolio. The current directory also lists UnoOne, JAK Shield and SwasthyaScore AI."
      },
      {
        "q": "What is the current flagship?",
        "a": "PAI, implemented through UnoOne Power for Windows and UnoOne Mobile for Android. The web console is a separate product, and cross-device continuity remains in development."
      },
      {
        "q": "Are accounts and health, education or search data linked through Aadhaar?",
        "a": "No verified integration or authorized Aadhaar relationship is established by this article. Do not assume cross-product identity or personal-data sharing."
      },
      {
        "q": "Does all processing stay in India?",
        "a": "No portfolio-wide regional-processing guarantee is established here. Check the specific product’s data flows, providers and terms."
      },
      {
        "q": "Are all products deployed and available now?",
        "a": "No blanket claim is made. Sites and repositories are entry points; release status, access and any claimed field deployments require product-specific evidence."
      }
    ],
    "hashtags": [
      "InBharat",
      "DeshKaAI",
      "AIForBharat",
      "IndianStartup",
      "AIEcosystem",
      "BuildingBharat"
    ],
    "dateModified": "2026-11-16"
  },
  {
    "slug": "desh-ka-ai",
    "title": "Desh Ka AI: What It Means to Build for Bharat",
    "description": "An India-first, globally collaborative AI-building philosophy, distinct from claims about model provenance or regional processing.",
    "category": "InBharat",
    "datePublished": "2026-06-17",
    "readMinutes": 8,
    "visual": "desh-ka-ai.png",
    "abstract": "Desh Ka AI expresses an India-first product-building philosophy: attend to local language needs, infrastructure, cost and context while collaborating globally. It is not a training-data provenance, national superiority or India-only processing guarantee. Sovereign AI can also involve open and private-sector systems; the terms are not strict opposites.",
    "faq": [
      {
        "q": "What does \"Desh Ka AI\" mean?",
        "a": "\"Country's AI\"—AI built in India, for India, by Indians: trained on Indian data, in Indian languages, designed for Indian constraints (payments, regulation, climate, infrastructure), and owned by Indians, with India as the primary market."
      },
      {
        "q": "How is Desh Ka AI different from \"sovereign AI\"?",
        "a": "Sovereign AI refers to control and autonomy and can include open systems and private companies. Desh Ka AI is open, private-sector-led, collaborates globally, and is a complement—you use Indian AI when it's best for Indian problems, American AI when it's best."
      },
      {
        "q": "What makes AI genuinely \"Desh Ka\"?",
        "a": "Built with relevant, lawfully obtained data, in Indian languages (multiple scripts across the 22 scheduled languages), for Indian constraints (UPI, DPDP Act, monsoon farming, uneven access to care), owned by Indians, and designed for Indian users as the primary market—not an afterthought."
      },
      {
        "q": "Is Desh Ka AI only for India?",
        "a": "No—it's a global advantage. Tools evaluated on representative local contexts, a healthcare AI for tropical and resource-constrained settings, an agricultural AI for monsoon farming—these solve problems for billions across the Global South that American AI doesn't touch."
      },
      {
        "q": "Why is Desh Ka AI defensible?",
        "a": "It's built for problems American companies don't understand and won't prioritize. Solving rural healthcare or no-credit-history finance for hundreds of millions of Indians creates value and expertise that's hard to replicate—and exports to similar markets worldwide."
      }
    ],
    "hashtags": [
      "InBharat",
      "DeshKaAI",
      "AIForBharat",
      "IndianLeadership",
      "BuildingAI",
      "BharatPehle"
    ],
    "dateModified": "2026-11-16"
  },
  {
    "slug": "harness-engineering",
    "title": "Harness Engineering: Building Safe and Reliable AI Agent Systems",
    "description": "Agent harness design with permissions, policy checks, bounded execution and audit records. Controls reduce risk; they do not guarantee safety.",
    "category": "Engineering",
    "datePublished": "2026-06-27",
    "readMinutes": 6,
    "visual": "harness-engineering.png",
    "abstract": "Harness engineering places explicit software controls around model-generated actions: permissions, validation, bounded execution and audit records. JAK Swarm and JAK Shield illustrate this design approach. Controls can detect or block defined failures, but cannot guarantee complete detection, clinical safety or production readiness.",
    "faq": [
      {
        "q": "What is Harness Engineering in the context of AI agents?",
        "a": "Harness engineering is the practice of building deterministic software wrappers around non-deterministic AI agents. It intercepts, validates, monitors, and controls the inputs, outputs, and tool executions of LLMs to enforce defined policies and expose failures for review; correctness still depends on the harness, policies and integrations."
      },
      {
        "q": "How does JAKSwarm.com approach agent harness design?",
        "a": "JAKSwarm.com acts as an evidence engine and agent-orchestration platform. It wraps agents behind the JAK Shield risk gate, tracking actions in an evidence graph, managing execution, and using drift checks to identify some departures from configured operational boundaries."
      },
      {
        "q": "Why is a risk gate like JAK Shield necessary for enterprise AI?",
        "a": "A risk gate acts as a final, deterministic firewall. Even if an LLM generates an incorrect or unsafe instruction, the risk gate intercepts the command, evaluates it against strict safety policies, and can block actions that violate configured policies. Coverage and implementation must be tested; no universal harm-prevention guarantee follows."
      },
      {
        "q": "How does drift detection protect AI agents over time?",
        "a": "Drift detection monitors agent behavior, prompt performance, and LLM output distributions over time. If an underlying model update or a change in user data causes the agent's actions to shift away from established safety and accuracy baselines, the harness flags the system for review."
      },
      {
        "q": "How does harness engineering apply to critical sectors like Indian healthcare?",
        "a": "In a proposed healthcare workflow, a harness can require review and check defined constraints. This example is not a verified Sahayaak Seva deployment, clinical validation or guarantee of medical safety. Clinical decisions require qualified professionals and evidence for the intended use."
      }
    ],
    "hashtags": [
      "InBharat",
      "DeshKaAI",
      "HarnessEngineering",
      "AIAgents",
      "SoftwareEngineering",
      "LLMOps",
      "TechIndia"
    ],
    "dateModified": "2026-11-16"
  },
  {
    "slug": "neural-networks-the-core-of-practical-ai-for-indian-engineer",
    "title": "Neural Networks: The Core of Practical AI for Indian Engineers",
    "description": "Neural-network fundamentals, model selection and deployment trade-offs for Indian engineers, without unsupported customer benchmarks or accuracy guarantees.",
    "category": "AI Foundations",
    "datePublished": "2026-06-28",
    "readMinutes": 6,
    "visual": "neural-networks-the-core-of-practical-ai-for-indian-engineer.png",
    "abstract": "Neural networks learn parameters from data using gradients and an optimization procedure. Engineers should compare them with simpler baselines, then measure accuracy, latency, memory and cost for the intended workload. Quantization and local execution can help, but their quality and performance effects require evaluation.",
    "faq": [],
    "hashtags": [],
    "dateModified": "2026-11-16"
  },
  {
    "slug": "fine-tuning-vs-rag-when-to-use-each-for-your-indian-ai-produ",
    "title": "Fine-Tuning vs. RAG: When to Use Each for Your Indian AI Product",
    "description": "Navigating fine-tuning vs. RAG for your AI product in India? This guide by InBharat AI founder Reeturaj Goswami breaks down the practical considerations.",
    "category": "AI Foundations",
    "datePublished": "2026-06-29",
    "readMinutes": 9,
    "visual": "fine-tuning-vs-rag-when-to-use-each-for-your-indian-ai-produ.png",
    "abstract": "Use retrieval for changing knowledge and source references, and consider fine-tuning for repeatable task behaviour or style when evaluation justifies it. Both can be combined or deployed locally. Compare quality, latency, training and serving cost on your workload; neither method guarantees factuality or universal cost superiority.",
    "faq": [
      {
        "q": "Can I use both fine-tuning and RAG together?",
        "a": "Yes. You can fine-tune for task behaviour or style and use retrieval to supply relevant documents at inference time. Evaluate the combined system: fine-tuning does not guarantee factual recall, and retrieval does not guarantee that the model uses current sources correctly."
      },
      {
        "q": "Which approach is better for handling multiple Indian languages?",
        "a": "Neither approach guarantees multilingual quality. For RAG, evaluate document coverage, retrieval and generation in each target language. Fine-tuning needs representative, high-quality examples suited to the task; parallel language pairs can help translation tasks but are not a general requirement for multilingual supervised fine-tuning. Use held-out per-language tests, including code-switching where relevant, for either approach."
      },
      {
        "q": "What are the hidden costs of fine-tuning that Indian startups should be aware of?",
        "a": "Include data collection, cleaning, annotation, evaluation, experiment management, serving and maintenance in a fine-tuning budget. Domain changes may require new training or retrieval updates, depending on what changed. RAG also has ingestion, embedding, storage, retrieval and evaluation costs. Compare total costs on the same workload rather than assuming either approach is cheaper."
      }
    ],
    "hashtags": [
      "AIinIndia",
      "LLMs",
      "RAG",
      "FineTuning",
      "InBharatAI"
    ],
    "dateModified": "2026-11-16"
  },
  {
    "slug": "building-unoone-leaf-indias-local-agi-fabric",
    "title": "UnoOne LEAF: A Historical Local-Agent Research Proposal",
    "description": "A corrected historical record of UnoOne LEAF research, its proposed local-agent architecture and the distinction from current PAI and UnoOne development.",
    "category": "AI Foundations",
    "datePublished": "2026-06-29",
    "readMinutes": 2,
    "visual": "building-unoone-leaf-indias-local-agi-fabric.png",
    "abstract": "UnoOne LEAF was a local-agent research proposal, not demonstrated AGI. Its Qwen-first plan, sleep-learning idea and 4GB device target remain historical design ambitions rather than qualified capabilities. Current PAI development is implemented through UnoOne Power for Windows and UnoOne Mobile for Android; neither claims autonomous self-improvement.",
    "faq": [
      {
        "q": "Is LEAF demonstrated AGI or autonomous self-improvement?",
        "a": "No. Those phrases described historical ambitions, not demonstrated capabilities. Current PAI and SILT positioning makes neither claim."
      },
      {
        "q": "Is the 4GB Qwen-first plan a supported-device promise?",
        "a": "No. It is a historical research target. Check the current UnoOne product pages for scoped implementation and validation information."
      },
      {
        "q": "Has LEAF been abandoned?",
        "a": "That is not established here. Its continuing research or roadmap status requires owner confirmation; this article preserves the proposal without presenting it as a shipped product."
      }
    ],
    "hashtags": [],
    "dateModified": "2026-11-16"
  },
  {
    "slug": "why-i-am-building-jak-shield-an-ai-safety-net-for-bharat",
    "title": "Why I Am Building JAK Shield: An AI Safety Net for Bharat",
    "description": "The motivation for JAK Shield’s bounded tool-use risk controls, approval workflows and auditability, without universal protection promises.",
    "category": "AI Foundations",
    "datePublished": "2026-06-30",
    "readMinutes": 6,
    "visual": "why-i-am-building-jak-shield-an-ai-safety-net-for-bharat.png",
    "abstract": "JAK Shield is a tool-use risk-control layer intended to evaluate proposed agent actions, gate consequential operations and record audit evidence. This article explains the design motivation, not a guarantee against all prompt injection, data leaks or harmful actions. Coverage depends on implementation, policy and testing.",
    "faq": [
      {
        "q": "How is JAK Shield different from existing AI safety features within models?",
        "a": "While many models have internal guardrails, JAK Shield acts as an external action-policy layer for supported integrations. It provides an independent layer of verification and control *before* an action is executed, regardless of the underlying model. This allows for consistent policy enforcement and auditability across different AI agents and models."
      },
      {
        "q": "Can JAK Shield protect against all types of AI risks?",
        "a": "Our aim is comprehensive protection, but like any security system, it's an ongoing battle. JAK Shield is designed to detect and mitigate a wide range of known and emerging risks, including prompt injection, data leaks, and unsafe tool calls. New threats require continued testing and policy updates; no universal coverage or update-service guarantee is established here."
      },
      {
        "q": "Is JAK Shield only for developers, or can end-users benefit?",
        "a": "Both. Developers can integrate JAK Shield into their AI applications for robust security. Crucially, end-users will benefit from a safer, more reliable AI experience without needing to understand the underlying technical complexities. It's designed to be a transparent safety net."
      }
    ],
    "hashtags": [],
    "dateModified": "2026-11-16"
  },
  {
    "slug": "building-a-digital-shield-ai-for-scam-detection-in-indian-te",
    "title": "Building a Digital Shield: AI for Scam Detection in Indian Tenders",
    "description": "A proposed AI document-review workflow for tender red flags, independent source verification and human review, not a certified fraud detector.",
    "category": "AI Tools",
    "datePublished": "2026-07-02",
    "readMinutes": 5,
    "visual": "building-a-digital-shield-ai-for-scam-detection-in-indian-te.png",
    "abstract": "An AI document-review layer can flag inconsistencies and suspicious tender instructions for independent verification. This is a proposed use case, not a certified fraud detector or proof that a document is authentic. Check consequential requests through official channels and keep a human responsible for decisions.",
    "faq": [
      {
        "q": "Is this a fully certified fraud detection system?",
        "a": "This article outlines a build direction and a practical AI safety use case. It details how AI can assist in identifying potential red flags in documents, but it is not a claim of a fully certified fraud detection system. It's a tool to augment human vigilance, not replace it entirely."
      },
      {
        "q": "What kind of organizations in India can benefit from this?",
        "a": "GovTech startups, MSMEs, procurement teams, NGOs, and compliance officers across India can all significantly benefit from an AI-powered scam detection layer to enhance their due diligence processes. It's about making our digital interactions safer and more efficient."
      },
      {
        "q": "How does this differ from traditional manual checks?",
        "a": "Traditional manual checks are time-consuming, resource-intensive, and prone to human error, especially for small teams without dedicated compliance departments. AI automates the initial screening, flagging suspicious elements that might otherwise be missed, allowing human experts to focus on complex cases. For more on this, consider reading about Leveraging AI for Enhanced Compliance in the Indian Market."
      }
    ],
    "hashtags": [],
    "dateModified": "2026-11-16"
  },
  {
    "slug": "evals-for-ai-features-measuring-what-actually-ships",
    "title": "AI Evals: Why \"It Looks Fine To Me\" Isn't an Evaluation",
    "description": "Golden sets, regression checks and human review for measuring defined AI tasks, without claiming universal quality from a sample.",
    "category": "AI Tools",
    "datePublished": "2026-07-03",
    "readMinutes": 7,
    "visual": "evals-for-ai-features-measuring-what-actually-ships.png",
    "abstract": "AI evaluations measure defined tasks on representative test cases and help detect regressions. Golden sets, human review, adversarial tests and production monitoring serve different purposes. Passing a sample does not establish universal quality, and this guide is not an audit of every InBharat product’s release gates.",
    "faq": [
      {
        "q": "What is a 'golden dataset' in AI evaluations?",
        "a": "A golden dataset is a collection of human-verified inputs and their corresponding, correct outputs. It serves as the 'ground truth' to measure how accurately an AI system performs against desired behavior. Representative cases help measure language and cultural coverage; they do not prove universal understanding."
      },
      {
        "q": "Why can't I just manually test my AI feature before shipping?",
        "a": "Manual testing is insufficient for AI because AI models, especially LLMs, can be non-deterministic, have vast numbers of edge cases, and can suffer from subtle regressions that are hard to spot without systematic checks. A quick demo can't cover the breadth of real-world scenarios, particularly in a market as diverse as India."
      },
      {
        "q": "How do AI evaluations help with the unique challenges of deploying AI in India?",
        "a": "AI evaluations are crucial for India due to its vast linguistic diversity, varying network conditions (4G/5G), and range of user devices. Evals help measure accuracy across sampled languages and dialects, inference speed and cost efficiency for a price-sensitive market, directly addressing the 'Desh Ka AI' challenge."
      }
    ],
    "hashtags": [
      "AIEvals",
      "MLOps",
      "AIQuality",
      "IndianAI",
      "InBharatAI"
    ],
    "dateModified": "2026-11-16"
  },
  {
    "slug": "streaming-llm-responses-ux-and-cost-trade-offs",
    "title": "Streaming LLM Responses: The UX Illusion and Real-World Costs for Indian AI",
    "description": "Streaming LLM responses feels faster, but it's not always cheaper or better for UX. I break down the trade-offs for Indian AI apps.",
    "category": "AI Foundations",
    "datePublished": "2026-07-04",
    "readMinutes": 7,
    "visual": "streaming-llm-responses-ux-and-cost-trade-offs.png",
    "abstract": "Streaming LLM responses can significantly improve perceived latency by delivering the first token quickly. However, it introduces architectural complexity and can sometimes increase overall cost, especially for smaller responses or when network conditions are unstable, a common challenge in diverse Indian contexts.",
    "faq": [
      {
        "q": "Does streaming LLM responses always make my app faster?",
        "a": "Streaming makes your app *feel* faster by reducing the 'time to first token' (TTFT), meaning the user sees output sooner. However, the total time to receive the *full* response might not be faster, and in some cases, the overhead of streaming could even slightly increase overall latency for very short responses."
      },
      {
        "q": "When should I use Server-Sent Events (SSE) versus WebSockets for streaming?",
        "a": "For most LLM response streaming, where the client sends a single request and receives a continuous stream of data from the server, SSE is often simpler and more efficient. WebSockets are better suited for full-duplex, real-time interactive applications where both the client and server need to send continuous data."
      },
      {
        "q": "Can streaming LLM responses increase my costs?",
        "a": "Yes, streaming can sometimes increase costs. Maintaining open connections for longer periods consumes server resources, and the aggregate network overhead of many small packets (tokens) can be higher than a single large batched response, especially for very short LLM outputs. It's a trade-off between perceived UX and actual infrastructure costs."
      }
    ],
    "hashtags": [
      "LLMStreaming",
      "AIUX",
      "IndianTech",
      "InBharatAI",
      "Engineering"
    ],
    "dateModified": "2026-11-16"
  },
  {
    "slug": "token-economics-pricing-an-ai-feature-without-losing-money",
    "title": "Token Economics: Pricing AI Features Without Bleeding Money",
    "description": "Price AI features with measured input/output costs, usage distributions, retries, limits and overhead. All numeric examples are illustrative.",
    "category": "AI Foundations",
    "datePublished": "2026-07-05",
    "readMinutes": 8,
    "visual": "token-economics-pricing-an-ai-feature-without-losing-money.png",
    "abstract": "Pricing AI features is tricky: a viral day can quickly turn profit into loss if your token economics are off. We'll explore per-request vs. per-token models, how to account for the long tail of complex queries, and setting a price floor that keeps your Indian AI product sustainable.",
    "faq": [
      {
        "q": "How do I explain token pricing to my users who are used to fixed prices?",
        "a": "The best approach is often to offer token bundles or credits. Instead of saying \"you pay per token,\" say \"buy 10,000 credits for ₹100, where each credit is roughly X tokens.\" Provide a simple calculator or estimate for common actions so users can gauge their usage. Transparency is key, even if simplified."
      },
      {
        "q": "What if my AI feature uses multiple LLMs with different token costs?",
        "a": "You'll need to track token usage per model. When calculating the cost for a user's request, sum up the token costs from all models involved. This can get complex, so consider abstracting it behind a single \"credit\" system where different actions consume different amounts of credits based on their underlying model costs."
      },
      {
        "q": "Is it better to start with per-request or per-token pricing for a new AI product?",
        "a": "For initial launch and user adoption, per-request pricing is often simpler for users to grasp. However, internally, you must model your costs on a per-token basis. As your product matures and users become more sophisticated, you can introduce per-token bundles or advanced tiers. Always start with a solid understanding of your token costs, regardless of your external pricing model."
      }
    ],
    "hashtags": [
      "AIPricing",
      "TokenEconomics",
      "IndianAI",
      "FinOps",
      "ProductManagement"
    ],
    "dateModified": "2026-11-16"
  },
  {
    "slug": "model-routing-and-cost-control-across-gemini-tiers",
    "title": "Smart Model Routing: Measuring Cost and Quality Across Model Tiers",
    "description": "A practical model-routing and caching pattern, with historical Gemini examples and clear measurement, privacy and pricing boundaries.",
    "category": "AI Tools",
    "datePublished": "2026-07-06",
    "readMinutes": 9,
    "visual": "model-routing-and-cost-control-across-gemini-tiers.png",
    "abstract": "Model routing assigns tasks to model tiers and can reduce cost when quality remains acceptable. Savings depend on workload, pricing, retries, cache hit rate and evaluation. This article retains historical Gemini examples as teaching material, not a current SDK recipe or a verified 60% InBharat cost reduction.",
    "faq": [
      {
        "q": "What is the main benefit of model routing?",
        "a": "The primary benefit is cost reduction. By using less powerful (and cheaper) models for simpler tasks and reserving more expensive, capable models for complex ones, you optimize your API spend. It also improves latency for simple queries."
      },
      {
        "q": "How do I determine which model is right for a specific task?",
        "a": "Generally, tasks requiring deep contextual understanding, multi-step reasoning, or generating long, creative content benefit from `Gemini 1.5 Pro`. Simpler tasks like summarization, sentiment analysis, or short translations are well-suited for `Gemini 1.5 Flash`. Experimentation with your specific use case is key."
      },
      {
        "q": "Is caching really that effective for LLM calls?",
        "a": "Yes, incredibly so. Many user queries are repetitive, especially for information retrieval or common questions. Caching these responses eliminates redundant API calls, saving significant cost and improving response times. A production cache must include tenant/user authorization scope, model/version, prompt policy and source revision, with expiry and deletion rules; prompt text alone is not a safe key."
      },
      {
        "q": "What if a task requires a powerful model but my budget is very tight?",
        "a": "Consider a multi-stage approach. First, try a simpler model with a constrained prompt. If it fails or the quality is insufficient, then escalate to a more powerful model. For critical tasks, you might also implement a human review fallback, especially if the cost of an incorrect AI output is high."
      }
    ],
    "hashtags": [
      "AIStrategy",
      "CostOptimization",
      "GeminiAPI",
      "IndianAI",
      "LLMOps"
    ],
    "dateModified": "2026-11-16"
  },
  {
    "slug": "context-engineering-managing-what-the-model-actually-sees",
    "title": "Context Engineering: Beyond Prompts for Real-World AI in India",
    "description": "Learn context engineering for LLMs: selecting, ordering, and truncating context windows for practical AI apps in India. Go beyond prompt engineering.",
    "category": "AI Foundations",
    "datePublished": "2026-07-07",
    "readMinutes": 8,
    "visual": "context-engineering-managing-what-the-model-actually-sees.png",
    "abstract": "Context engineering is the deliberate practice of designing and optimizing all information an AI model, especially LLMs, \"sees\" at inference time to achieve accurate and reliable outputs. It goes beyond simple prompt crafting by managing the full context window, crucial for building robust AI applications in India.",
    "faq": [
      {
        "q": "What is the difference between prompt engineering and context engineering?",
        "a": "Prompt engineering focuses on crafting effective instructions for an LLM. Context engineering is a broader discipline that encompasses prompt engineering but also includes the strategic selection, ordering, and truncation of all other information (documents, conversation history, user data) provided to the model at inference time."
      },
      {
        "q": "Why is context engineering particularly important for AI development in India?",
        "a": "In India, context engineering is crucial due to factors like multilingualism, data scarcity in specific domains, the need for cost-efficient solutions (minimizing token usage), and optimizing for network latency on diverse internet infrastructures. It supports evaluating accuracy, cost and performance across relevant local conditions; no context strategy guarantees them."
      },
      {
        "q": "What are some common techniques for context truncation?",
        "a": "Common techniques for context truncation include summarization of older information, using a sliding window to keep only the most recent or relevant parts of a long text, and prioritizing critical information to ensure it is always included even if other parts are cut."
      }
    ],
    "hashtags": [
      "ContextEngineering",
      "LLMOps",
      "AIEngineering",
      "BharatAI",
      "InBharat"
    ],
    "dateModified": "2026-11-16"
  },
  {
    "slug": "multilingual-llm-apps-beyond-english-only-prompts",
    "title": "Building Multilingual LLM Apps for Bharat: Beyond English-Only Prompts",
    "description": "Strategies for multilingual LLM applications: translation, direct prompting, fine-tuning and per-language evaluation, with honest coverage boundaries.",
    "category": "AI Tools",
    "datePublished": "2026-07-09",
    "readMinutes": 9,
    "visual": "multilingual-llm-apps-beyond-english-only-prompts.png",
    "abstract": "Multilingual AI requires evaluation of translation, code-switching, task accuracy and cost in each intended language. Translation APIs, direct multilingual prompting and fine-tuning have different trade-offs. A language selector or model language list does not establish complete UI or speech support, and sensitive outputs require appropriately scoped review.",
    "faq": [
      {
        "q": "Is it always necessary to detect the user's language before prompting a multilingual LLM?",
        "a": "While many multilingual LLMs can automatically infer the language, explicit language detection can improve reliability. It allows you to tailor system prompts (e.g., \"Respond in Hindi\") or even route to different models if you have specialized ones, ensuring a more consistent user experience."
      },
      {
        "q": "How do I handle languages with very little digital data for fine-tuning?",
        "a": "This is a significant challenge. For low-resource languages, start with a robust multilingual LLM (Strategy 2). If fine-tuning is absolutely necessary, consider techniques like zero-shot or few-shot learning, cross-lingual transfer (training on a high-resource language and adapting), or leveraging synthetic data generation, though the quality of synthetic data needs careful validation."
      },
      {
        "q": "What are the main cost drivers when building multilingual LLM apps for India?",
        "a": "The primary cost drivers are LLM inference tokens (for both prompts and responses), translation API calls (if using Strategy 1), and compute resources for fine-tuning or running larger models. Data acquisition and annotation for specific languages can also be a significant hidden cost."
      }
    ],
    "hashtags": [
      "MultilingualAI",
      "IndicLanguages",
      "LLMApps",
      "AIforBharat",
      "InBharatAI"
    ],
    "dateModified": "2026-11-16"
  },
  {
    "slug": "building-unoone-an-offline-ai-agent-for-bharats-realities",
    "title": "Building UnoOne Mobile: A Historical Android Development Note",
    "description": "A corrected Android development account: local planning, speech, accessibility, blocked sensitive actions and current UnoOne Mobile alpha boundaries.",
    "category": "AI Tools",
    "datePublished": "2026-07-14",
    "readMinutes": 7,
    "visual": "building-unoone-an-offline-ai-agent-for-bharats-realities.png",
    "abstract": "This historical Android article describes the work now called UnoOne Mobile, part of the PAI ecosystem alongside UnoOne Power for Windows. Local planning, speech and accessibility remain subject to build and device validation. Payment, OTP, password-entry and auto-send are blocked agent actions, not actions enabled by confirmation. No public installer is offered.",
    "faq": [
      {
        "q": "What makes UnoOne different from other AI assistants?",
        "a": "The Android work now called UnoOne Mobile is designed for local planning, Indian language needs and accessibility, including its proposed 'Blind Vision' accessibility feature for visually impaired users. Most assistants are cloud-dependent and less integrated with device control."
      },
      {
        "q": "How does UnoOne ensure user privacy?",
        "a": "The design stores personal memory locally and implements on-device planning. Current Mobile planner activation and device migrations remain under validation; see the Mobile capability page. Payment, OTP, password-entry and auto-send are blocked agent actions. The user completes such steps manually outside the agent. Optional online research and external app actions can transmit permitted data; local memory is not a no-network guarantee."
      },
      {
        "q": "When will UnoOne be available to the public?",
        "a": "UnoOne Mobile is an Android alpha with no public installer. Device, language and accessibility validation remain open; this article does not establish completed user studies. We are working towards a public release, but our priority is ensuring stability, safety, and accuracy for Bharat's diverse needs."
      }
    ],
    "hashtags": [],
    "dateModified": "2026-11-16"
  },
  {
    "slug": "voice-first-ai-designing-for-ears-before-screens",
    "title": "Voice-First AI: Why We Design for Ears Before Screens in Bharat",
    "description": "Building voice-first AI for India's low-end phones and patchy 4G. Learn about wake words, hands-free flows, and graceful text fallbacks for real-world use.",
    "category": "AI Tools",
    "datePublished": "2026-07-17",
    "readMinutes": 7,
    "visual": "voice-first-ai-designing-for-ears-before-screens.png",
    "abstract": "Voice-first design can improve accessibility through hands-free input, confirmation and text fallback. Its usefulness depends on language, accent, noise, hardware and network testing. This article discusses design patterns, not measured superiority of InBharat-trained speech models; connected speech architectures are distinct from UnoOne’s local speech development.",
    "faq": [
      {
        "q": "How should Indian languages and accents be evaluated?",
        "a": "Test speech recognition and synthesis separately on consented, representative recordings, accents, noise and code-switching. This article provides no proprietary training record or comparative accuracy benchmark."
      },
      {
        "q": "What happens when speech recognition is uncertain?",
        "a": "Ask for confirmation, display editable text or request a repeat. Consequential actions need explicit review rather than reliance on a confidence score alone."
      },
      {
        "q": "Does a voice-first interface work offline?",
        "a": "Only if its required speech and model components run locally. Cloud STT or TTS needs connectivity; UnoOne local speech coverage is scoped separately by build, device and language."
      }
    ],
    "hashtags": [
      "VoiceFirstAI",
      "AIforBharat",
      "IndianTech",
      "Accessibility",
      "InBharat"
    ],
    "dateModified": "2026-11-16"
  },
  {
    "slug": "mcp-servers-in-plain-english",
    "title": "Model Context Protocol (MCP) Servers: Why Your AI Needs a Standard 'Language'",
    "description": "MCP explained accurately: AI hosts, clients, servers, tools, resources and prompts, with permission boundaries and the limits of interoperability.",
    "category": "AI Foundations",
    "datePublished": "2026-07-26",
    "readMinutes": 3,
    "visual": "mcp-servers-in-plain-english.png",
    "abstract": "Model Context Protocol is a client-server protocol connecting AI applications to tools, resources and prompts through structured messages. The application hosts the client; the model does not need to implement MCP itself. Compatibility, authentication, authorization and safe tool execution still require deliberate implementation and testing.",
    "faq": [
      {
        "q": "Is MCP an AI model?",
        "a": "No. It is a protocol between clients and servers, used by AI applications to access capabilities such as tools, resources and prompts."
      },
      {
        "q": "Is any JSON API an MCP server?",
        "a": "No. A custom HTTP API is not MCP unless it implements the applicable protocol and interoperates with a compatible client."
      },
      {
        "q": "Does MCP ensure authorization or multilingual accuracy?",
        "a": "No. Hosts and servers must enforce authorization and consent; model and language quality require separate evaluation."
      }
    ],
    "hashtags": [
      "AIFoundations",
      "ModelContextProtocol",
      "IndianAI",
      "AIEngineering",
      "InBharat"
    ],
    "dateModified": "2026-11-16"
  },
  {
    "slug": "prompt-chaining-vs-a-single-mega-prompt",
    "title": "Prompt Chaining vs. Mega-Prompts: When to Decompose for Robust AI in India",
    "description": "Understand prompt chaining vs. mega-prompts for AI in India. Learn cost, reliability, and latency trade-offs with practical, Bharat-specific examples.",
    "category": "AI Tools",
    "datePublished": "2026-07-29",
    "readMinutes": 7,
    "visual": "prompt-chaining-vs-a-single-mega-prompt.png",
    "abstract": "Prompt chaining decomposes work into separately testable steps. It can improve debugging and allow smaller models or deterministic tools, but sequential calls add latency and errors may propagate. Compare total cost and task quality with a single prompt; healthcare examples require clinical validation and professional oversight.",
    "faq": [
      {
        "q": "Does prompt chaining increase latency due to multiple API calls?",
        "a": "Sequential calls add waiting time, and retries and repeated context can add cost. Independent steps may run in parallel; dependent steps must wait for their inputs. Smaller models or early results may help responsiveness, but measure end-to-end latency, total cost and task quality against a single-prompt baseline."
      },
      {
        "q": "Can I use different LLMs for different steps in a chain?",
        "a": "Absolutely. This is one of the major benefits. You can use a cheaper, smaller model for simple tasks (e.g., extraction) and a more powerful, expensive model only for critical, complex steps (e.g., creative generation or nuanced reasoning). This creates an opportunity to trade cost against quality; evaluate the complete chain, including retries, rather than assuming both improve."
      },
      {
        "q": "How does prompt chaining relate to 'prompt engineering'?",
        "a": "Prompt chaining is a specific technique within the broader field of Prompt Engineering Is a Real Skill — and Indian Developers Who Master It Will Win. Effective prompt engineering involves not just crafting good individual prompts, but also designing how those prompts interact in a sequence to achieve a larger goal. Chaining is a core pattern that advanced prompt engineers utilize."
      },
      {
        "q": "Is there a framework or library to help with prompt chaining?",
        "a": "Yes, frameworks like LangChain, LlamaIndex, and AutoGen are designed to facilitate prompt chaining, agentic workflows, and tool integration. They provide structures to define sequences, manage intermediate states, and connect LLMs with external APIs and databases."
      }
    ],
    "hashtags": [
      "PromptChaining",
      "AIEngineering",
      "LLMOps",
      "InBharatAI",
      "PromptEngineering"
    ],
    "dateModified": "2026-11-16"
  },
  {
    "slug": "local-first-ai-running-models-on-your-own-laptop",
    "title": "Local-First AI: Why Running Models on Your Own Laptop Matters for India",
    "description": "Explore local-first AI for Indian contexts: enhanced privacy, lower costs, and offline access. Learn to run Whisper, MMS, and Ollama on your device.",
    "category": "AI Tools",
    "datePublished": "2026-08-01",
    "readMinutes": 9,
    "visual": "local-first-ai-running-models-on-your-own-laptop.png",
    "abstract": "Local-first AI runs selected inference paths on a device and can reduce cloud dependence. It does not automatically provide an air gap, eliminate costs or keep all traffic local. Downloads, updates and optional connectors may use the network; hardware performance, language coverage and privacy boundaries need separate evaluation.",
    "faq": [
      {
        "q": "Is local-first AI only for low-resource devices?",
        "a": "Not necessarily. While it's excellent for devices with limited connectivity or processing power, even high-end devices benefit from enhanced privacy, lower latency, and cost savings by keeping data local. The choice depends on your specific application's needs and user base."
      },
      {
        "q": "How do I handle model updates for local-first AI?",
        "a": "Model updates typically involve a secure over-the-air (OTA) distribution mechanism. The application periodically checks for new model versions from a central cloud repository and downloads them, often incrementally, to the local device. Updates require authenticated distribution, integrity checks, rollback and a user-appropriate connectivity policy; they do not guarantee the latest model is always installed."
      },
      {
        "q": "What about models that are too large for local devices?",
        "a": "For very large or complex models, a hybrid approach works best. Core, frequently used functionalities can run locally, while more advanced or less frequent tasks can be offloaded to the cloud when connectivity is available. Techniques like model quantization, pruning, and knowledge distillation can also significantly reduce model size for local deployment."
      },
      {
        "q": "What are the key benefits of local-first AI for an Indian SMB?",
        "a": "For an Indian SMB, the primary benefits are reduced operational costs (no per-inference cloud billing), enhanced data privacy (critical for compliance and trust), and reliable functionality in areas with inconsistent internet. This makes AI solutions more affordable and accessible to a broader Indian market."
      }
    ],
    "hashtags": [
      "LocalFirstAI",
      "EdgeAI",
      "AIForBharat",
      "OfflineAI",
      "InBharatAI"
    ],
    "dateModified": "2026-11-16"
  },
  {
    "slug": "embeddings-what-they-actually-do-and-when-you-dont-need-them",
    "title": "Embeddings: What They Actually Do and When You Don't Need Them",
    "description": "Embeddings, cosine similarity, pgvector and full-text search: what each does, their limits, and how to select a measured retrieval baseline.",
    "category": "AI Foundations",
    "datePublished": "2026-07-22",
    "readMinutes": 8,
    "visual": "embeddings-what-they-actually-do-and-when-you-dont-need-them.png",
    "abstract": "Embeddings represent data as vectors for similarity-based retrieval. pgvector stores and searches those embeddings within PostgreSQL; full-text search is a different, keyword-based approach that may not require embeddings. Cosine similarity measures vector direction, not guaranteed meaning. Choose and benchmark retrieval methods against real queries and access-control requirements.",
    "faq": [
      {
        "q": "Is `pgvector` suitable for all AI applications?",
        "a": "`pgvector` is excellent for many initial AI features, especially semantic search and RAG, within moderate datasets (up to tens of millions of vectors). For extremely large-scale applications with billions of vectors or very high query throughput, dedicated vector databases might offer better performance and advanced features."
      },
      {
        "q": "How does `pgvector` compare to cloud-managed vector services?",
        "a": "`pgvector` offers simplicity and cost-effectiveness by leveraging your existing PostgreSQL instance. Cloud services often provide managed scalability, advanced features, and potentially lower latency at extreme scale, but come with higher operational overhead and cost. The choice depends on your project's specific requirements and budget."
      },
      {
        "q": "Can I use Full-Text Search and embeddings together?",
        "a": "Absolutely. Many robust search systems combine keyword-based Full-Text Search with semantic search using embeddings. This hybrid approach allows you to capture both explicit keyword matches and conceptual relevance, providing a more comprehensive search experience for users."
      }
    ],
    "hashtags": [
      "AI",
      "Embeddings",
      "pgvector",
      "SemanticSearch",
      "IndianTech"
    ],
    "dateModified": "2026-11-16"
  },
  {
    "slug": "red-teaming-your-ai-feature-before-it-ships",
    "title": "Red-Teaming Your AI Feature: Cheap Tests Before You Ship",
    "description": "Authorized adversarial tests, synthetic canaries and human review to find AI safety gaps; no passing sample proves complete protection.",
    "category": "Security",
    "datePublished": "2026-07-30",
    "readMinutes": 7,
    "visual": "red-teaming-your-ai-feature-before-it-ships.png",
    "abstract": "Low-cost AI red-teaming uses authorized adversarial tests to look for unsafe actions, data exposure and instruction-boundary failures. Synthetic canaries, defined expected behaviour and human review can support regression tests. Passing them does not prove complete safety, and this article does not establish a healthcare deployment or every-product release gate.",
    "faq": [
      {
        "q": "What is red-teaming in the context of AI?",
        "a": "Red-teaming for AI involves intentionally trying to make an AI model misbehave, leak data, or generate harmful content by using adversarial prompts and other techniques. It's about proactively finding vulnerabilities before they are exploited by real attackers."
      },
      {
        "q": "Do I need a large budget to red-team my AI?",
        "a": "No. While large enterprises might hire dedicated red-teaming firms, SMBs and smaller product teams can adopt a 'red-teaming-lite' approach. This involves defining 'no-go' zones, creating a library of adversarial prompts, and using simple scripts for automated testing, often integrated into existing CI/CD pipelines."
      },
      {
        "q": "What types of vulnerabilities should I look for when red-teaming my AI?",
        "a": "Focus on adversarial prompting (tricking the AI into unintended actions), data leak probing (getting the AI to reveal sensitive internal or training data), and jailbreak attempts (bypassing safety filters to generate harmful content). Also consider unique challenges for India, like multilingual prompts and regional nuances."
      }
    ],
    "hashtags": [
      "AIsecurity",
      "RedTeaming",
      "InBharatAI",
      "AISafety",
      "DevSecOps"
    ],
    "dateModified": "2026-11-16"
  }
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