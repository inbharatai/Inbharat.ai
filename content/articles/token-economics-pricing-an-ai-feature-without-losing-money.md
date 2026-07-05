> "You're getting $8000 worth of AI usage for a $200 subscription" sounds great until you realize those studies use scripts to max out usage . For Indian SMBs building AI features, this kind of marketing fluff is dangerous. We need concrete strategies to price AI without losing money, especially when dealing with variable token costs and unpredictable user behavior. At InBharat AI, we've learned that getting token economics right is crucial for survival, not just profitability .

## The Core Problem: Variable Costs Meet Fixed Expectations

Traditional software often has predictable, relatively fixed costs per user or per feature. AI, especially with large language models (LLMs), introduces a consumption-based model where you pay per token processed . This means a simple query might cost a few paise, while a complex, multi-turn conversation or a detailed report generation could cost rupees. If your pricing doesn't account for this variability, you're setting yourself up for losses.

Imagine a healthcare startup using Sahayaak Seva to assist field workers. A worker might ask, "What are the common symptoms of dengue?" (short, cheap). Another might ask, "Summarize the patient's last five visits, noting all prescribed medications and follow-up actions needed, then draft a discharge summary in Hindi." (long, expensive). If both are priced as a single "request," the latter will eat into your margins.

## Per-Request vs. Per-Token: Choosing Your Model

There are two primary ways to charge for AI features:

### 1. Per-Request Pricing

This is simpler for users to understand: "Pay ₹5 per query." It feels familiar, like API calls. The challenge is that a "request" isn't a uniform unit of work for an LLM. To make this work, you need to:

*   **Define Request Tiers:** A "simple" request (e.g., single-turn Q&A) vs. a "complex" request (e.g., document summarization, multi-turn chat). This means more complexity in your backend to classify and meter requests.
*   **Set a High-Enough Average:** Your per-request price must cover the *average* cost, plus profit. But averages hide the long tail.
*   **Guardrails:** Implement token limits per request on your end. If a user tries to generate a very long response, you might truncate it or charge for additional "units" of the request.

### 2. Per-Token Pricing

This is closer to how you pay the underlying LLM provider (e.g., OpenAI, Anthropic, or even your self-hosted model). You charge users based on the number of input and output tokens. For example, "₹0.001 per 1000 tokens." This is more accurate but can be harder for users to predict and understand.

*   **Transparency:** Users need a way to see how many tokens their actions consume. A small counter or an estimated cost before a complex operation can help.
*   **Bundles/Credits:** To simplify, you can sell token bundles (e.g., "1 lakh tokens for ₹1000"). This gives users a predictable spend while still aligning with usage.
*   **Pricing Tiers:** Different models might have different token costs. A cheaper, smaller model for simple tasks and a more expensive, powerful one for complex ones. This is similar to how we think about using specific models for specific tasks at InBharat AI, rather than a one-size-fits-all approach.

## The P95 Long Tail: Where Profits Go to Die

Most requests will be short and cheap. But a small percentage of users will make very long, complex, or repetitive requests that consume a disproportionate number of tokens. This is the p95 long tail – the 95th percentile of your usage. If your pricing only covers the average, these edge cases will quickly drain your budget.

**Example:** In a content generation tool like KathaKitaab, most users might generate a 500-word story. But a few might try to generate a 5000-word novel in one go. If you charge per story, the 5000-word one costs 10x more to generate but brings in the same revenue.

To handle the p95 long tail:

1.  **Analyze Your Usage Data:** Before launching, or even during beta, log token usage for every interaction. Understand your distribution. What's your average? What's your 90th percentile? Your 95th? Your max?
2.  **Price for the P95, Not the Average:** Your base price should cover at least the 95th percentile of your expected token usage, plus your desired profit margin. This ensures you're profitable on most interactions, even the longer ones.
3.  **Implement Hard Limits:** Set maximum input/output token limits per interaction. If a user exceeds it, prompt them to break down their request or indicate that additional charges apply. This prevents single, runaway requests from bankrupting your service.
4.  **Prompt Engineering for Cost:** Teach users (and your internal agents) to be concise. For example, instead of "Write me an essay on the history of India," suggest "Summarize key events in Indian history from 1947-2000 in 300 words." This is where skills like [Prompt Engineering Is a Real Skill](https://www.inbharat.ai/learn-ai-with-reeturaj/prompt-engineering) become directly relevant to your bottom line.

## Setting a Price Floor That Survives a Viral Day

What happens when your AI feature goes viral? Suddenly, you have 10x, 100x, or even 1000x the usage. If your pricing is too low, or if your long-tail problem isn't addressed, a viral day becomes a financial disaster. This is especially true in India, where a product can gain rapid traction through word-of-mouth or social media.

Your price floor is the absolute minimum you can charge to cover your direct costs (LLM API calls, inference compute, data storage) without losing money. It's not your profit margin, it's your break-even point.

**Steps to set a robust price floor:**

1.  **Calculate Per-Token Cost:** Know exactly what you pay per 1000 input tokens and per 1000 output tokens for each model you use. Don't forget any hidden costs like vector database lookups for RAG, which is essential for [How Indian AI Teams Make LLMs Actually Useful](https://www.inbharat.ai/learn-ai-with-reeturaj/rag).
2.  **Estimate Average Token Usage Per Feature:** For each AI feature (e.g., summarization, generation, Q&A), estimate the average number of input and output tokens it consumes.
3.  **Factor in Overhead:** Add a small percentage for your own infrastructure, monitoring, and development costs. Even if these are shared, attribute a portion.
4.  **Add a Buffer for Variability:** Given the p95 long tail, add a buffer (e.g., 20-30%) to your calculated cost to absorb unexpected spikes.
5.  **Multiply by Expected Volume:** If you expect 1 lakh requests a day, ensure your pricing covers that volume at the buffered cost.



## Practical Considerations for India

Building for Bharat means specific constraints and opportunities:

*   **Cost Sensitivity:** Indian users and SMBs are highly price-sensitive. A feature that's ₹50 in the US might need to be ₹5 in India. This means your underlying token costs need to be aggressively managed.
*   **Regional Languages:** Processing regional languages can sometimes have different tokenization behaviors or require specialized, potentially more expensive, models. If your product, like KathaKitaab, focuses on regional languages, factor this in.
*   **Inferencing on Local Hardware:** If you're running smaller, fine-tuned models on your own hardware (or even edge devices for Sahayaak Seva field agents), your cost structure shifts from API calls to compute and maintenance. This requires a different kind of FinOps approach .
*   **UPI Integration:** Seamless payment integration via UPI can reduce friction for micro-transactions, making per-token or small per-request charges more viable.

At InBharat AI, we're always optimizing our model choices and prompt strategies to keep costs down. Sometimes, a series of smaller, cheaper models chained together can outperform a single, expensive behemoth for specific tasks. This is a core tenet of building [Desh Ka AI](https://www.inbharat.ai/learn-ai-with-reeturaj/desh-ka-ai).

## Bottom Line

Don't let the promise of AI blind you to its real costs. Understanding token economics, accounting for the long tail of usage, and setting a robust price floor are non-negotiable for building sustainable AI products in India. Price for the worst-case viral day, not just the average, and you'll be in a much stronger position. For more on building robust AI systems, consider our insights on [What Agentic AI Really Means](https://www.inbharat.ai/learn-ai-with-reeturaj/agentic-ai) and how it impacts your system design.

## FAQ

**Q1: How do I explain token pricing to my users who are used to fixed prices?**
A1: The best approach is often to offer token bundles or credits. Instead of saying "you pay per token," say "buy 10,000 credits for ₹100, where each credit is roughly X tokens." Provide a simple calculator or estimate for common actions so users can gauge their usage. Transparency is key, even if simplified.

**Q2: What if my AI feature uses multiple LLMs with different token costs?**
A2: You'll need to track token usage per model. When calculating the cost for a user's request, sum up the token costs from all models involved. This can get complex, so consider abstracting it behind a single "credit" system where different actions consume different amounts of credits based on their underlying model costs.

**Q3: Is it better to start with per-request or per-token pricing for a new AI product?**
A3: For initial launch and user adoption, per-request pricing is often simpler for users to grasp. However, internally, you must model your costs on a per-token basis. As your product matures and users become more sophisticated, you can introduce per-token bundles or advanced tiers. Always start with a solid understanding of your token costs, regardless of your external pricing model.