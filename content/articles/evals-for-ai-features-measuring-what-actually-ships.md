> "It looks fine to me." This casual phrase is the death knell for reliable AI features. In India, where we build for a billion users across diverse languages, network conditions, and device types, shipping an AI feature without rigorous, systematic evaluation is a gamble we simply cannot afford. At InBharat AI, we learned early on that relying on intuition or a quick demo is not an evaluation. We need concrete metrics, golden datasets, and regression testing before every single deploy.

## The Problem: "Feels Good" Isn't Good Enough

Many teams, especially those new to AI, ship features the way they've always shipped traditional software: build, test with a few internal users, iterate, release. [2] This approach falls apart with AI, particularly with large language models (LLMs). Why?

1.  **Non-determinism:** Unlike a SQL query that returns the same result every time, an LLM might give slightly different answers for the same prompt. This variability makes ad-hoc testing insufficient.
2.  **Edge Cases Galore:** The long tail of user inputs, especially in India with its linguistic diversity and unique cultural contexts, is vast. Manually testing every permutation is impossible.
3.  **Subtle Regressions:** A small change in a prompt, a model update, or a new piece of RAG data can introduce subtle performance degradations that are hard to spot without a baseline. Imagine a customer support bot (like we build for Sahayaak Seva) suddenly misunderstanding common Hindi phrases after an update – a disaster for user trust.
4.  **Misaligned Expectations:** What a product manager *thinks* the AI should do and what it *actually* does can diverge significantly. [3] Without clear, measurable evaluation criteria, this gap remains hidden until users complain.

I've seen teams in Bengaluru spend weeks fine-tuning a model, only to find in production that it fails on basic queries from Tier-2 cities because their test data was too narrow. This is where systematic AI evaluations, or 'evals', come in. [1]

## What Are AI Evals?

AI evaluations are systematic frameworks for measuring whether your AI system performs the way you need it to. [1] They are not just about checking for bugs; they are about ensuring the AI meets specific performance criteria and user expectations.

Think of it like this: for traditional software, you write unit tests and integration tests. For AI, you build evals. They answer questions like:

*   Does the summarization model accurately capture the main points of a news article in Marathi?
*   Does the sentiment analysis correctly identify negative feedback in Hinglish?
*   Does the customer service agent (like the ones we discuss in [AI Agents Aren’t Just Chatbots](https://www.inbharat.ai/learn-ai-with-reeturaj/what-are-ai-agents)) provide relevant answers based on our internal knowledge base (as explored in [RAG: How Indian AI Teams Make LLMs Actually Useful](https://www.inbharat.ai/learn-ai-with-reeturaj/rag))?

## The Core Components of an Eval System

At InBharat AI, our eval system relies on two critical components:

### 1. Golden Datasets

A golden dataset (or 'golden set') is a collection of carefully curated inputs and their *expected, correct* outputs. These are human-verified examples that represent the desired behavior of your AI. They are the 'ground truth'.

For example, if you're building a feature that extracts entities (like names, locations, dates) from unstructured text:

*   **Input:** "On 15th August, Reeturaj Goswami visited the InBharat AI office in Pune."
*   **Expected Output:** `{"date": "15th August", "person": "Reeturaj Goswami", "organization": "InBharat AI", "location": "Pune"}`

We build golden sets for every critical AI feature. These sets are not static; they grow and evolve as we discover new edge cases or expand our product's capabilities. For instance, when we added support for more regional Indian languages in UniAssist, our golden sets expanded to include examples in Tamil, Bengali, and Gujarati, ensuring our models understood the nuances.

### 2. Regression Evals

Once you have a golden set, you run your AI system against it and compare its output to the expected output. This is a regression eval. The goal is to ensure that new code changes, model updates, or data refreshes don't negatively impact existing functionality. Just as [CI/CD](https://www.inbharat.ai/learn-ai-with-reeturaj/cicd) ensures code quality, regression evals ensure AI quality.

Here’s a simplified flow:



We automate this process. Before any AI feature goes live, it must pass its regression evals with a predefined accuracy threshold. If a change causes a drop in performance on the golden set, the deployment is blocked. This is non-negotiable.

## Types of Evals Beyond Golden Sets

While golden sets and regression evals are foundational, a comprehensive eval strategy includes more:

*   **LLM-as-a-Judge Evals:** For subjective tasks (like summarization or creative writing), human evaluation is gold standard, but slow. LLMs can sometimes act as 'judges' to score the output of another LLM against specific criteria. This is faster but requires careful prompt engineering for the judge LLM. [4]
*   **Offline Evals:** Running evals on historical data or synthetic data. This is good for rapid iteration and debugging before exposing the model to live traffic. [4]
*   **Online Evals (A/B Testing):** The ultimate test. Deploying a new AI feature to a small percentage of live users and measuring real-world impact (e.g., click-through rates, conversion, user satisfaction). This is crucial for understanding user behavior but should only be done after robust offline evals. [4]

## The India Deployment Reality

For us in India, evals are even more critical due to unique challenges:

*   **Language and Dialect Diversity:** Hindi, Tamil, Telugu, Kannada, Bengali, Marathi – each with its own nuances and even local dialects. Our golden sets must reflect this diversity. A model trained only on formal English will fail spectacularly.
*   **Network Latency:** Many users are on 4G or even 3G networks. An eval might measure not just accuracy but also inference speed, ensuring the user experience remains snappy. A feature that takes 10 seconds to respond is useless.
*   **Device Heterogeneity:** Users access our products on a wide range of devices, from high-end smartphones to older, budget-friendly models. Evals can sometimes include performance benchmarks on different device profiles.
*   **Cost Sensitivity:** Every token, every API call costs money. Evals can include cost efficiency metrics, ensuring our models are not just accurate but also economical, crucial when building for Bharat. We track inference costs in ₹, not just abstract credits.

This is why building for Bharat, as we discuss in [Desh Ka AI](https://www.inbharat.ai/learn-ai-with-reeturaj/desh-ka-ai), requires a disciplined approach to quality.

## Building Your Own Eval System

Starting small is key. Don't try to build the perfect system overnight.

1.  **Identify Critical Features:** Which AI features are most important to your users? Start with those.
2.  **Define Success Metrics:** What does 'good' look like? Is it 90% accuracy? 85% F1 score? A specific latency target? Be concrete.
3.  **Build Your First Golden Set:** Manually create 50-100 input-output pairs for your most critical feature. This is an investment, but it pays dividends.
4.  **Automate Comparison:** Write a script to run your AI against the golden set and compare outputs. Start with simple string matching, then move to more sophisticated metrics (e.g., Levenshtein distance, ROUGE scores for summarization).
5.  **Integrate with CI/CD:** Make evals a mandatory step in your deployment pipeline. If evals fail, the deployment fails. This is similar to how we approach security in [DevSecOps](https://www.inbharat.ai/learn-ai-with-reeturaj/devsecops) – it's baked in, not an afterthought.

## Bottom Line

Shipping AI features without a robust evaluation system is akin to driving a car without a speedometer or fuel gauge. You might get where you're going, but you're constantly at risk of running out of gas or crashing. For us at InBharat AI, golden sets and regression evals are non-negotiable. They are the guardrails that ensure our AI products, from UniAssist to Sahayaak Seva, actually deliver on their promise, consistently and reliably, for every user in India. Don't rely on "it looks fine to me"; build a system that *proves* it's fine. For more on how we build reliable AI, check out our insights on [What Agentic AI Really Means](https://www.inbharat.ai/learn-ai-with-reeturaj/agentic-ai).

---
Author: Reeturaj Goswami #AIEvals #ProductManagement #InBharatAI #TechInIndia #LLMEvals