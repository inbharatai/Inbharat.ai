> When we started building AI agents for Bharat, one of the first things we realized was that raw API costs from large models could quickly sink a project. We managed to cut our Gemini API expenses by a significant 60% by implementing a smart model routing strategy. This isn't about fancy algorithms; it's about practical decision-making: using the right model for the right task and caching results aggressively.

## The Cost Challenge of LLMs in India

Building AI products for India means operating under unique constraints. Our users might be on 4G networks, using mid-range devices, and every rupee spent on infrastructure counts. A single complex prompt to a powerful LLM can cost a few rupees. Multiply that by lakhs of users, and your monthly bill quickly becomes unsustainable. For example, prompts exceeding 200k tokens can cost as much as $4.00 for input and $18.00 for output [2, 3]. These are not numbers a bootstrapped Indian startup can ignore.

At InBharat AI, we're building vertical AI tools like Sahayaak Seva for healthcare and TestsPrep for exam preparation. These applications need reliable, fast, and cost-effective AI. Throwing a `Gemini 1.5 Pro` at every request is like using a sledgehammer to crack a nut – effective, but wasteful. We needed a way to be intelligent about our model usage.

## The Three Pillars of Cost-Effective LLM Usage

Our strategy boils down to three core principles:

1.  **Task-to-Model Matching:** Don't use a powerful, expensive model for a simple task. Gemini offers tiers like `Flash` (or `Flash-Lite`) for lighter loads and `Pro` for more complex, multi-step tasks . `Gemini 1.5 Pro` is the latest frontier model, while `Gemini 1.0 Pro` is a cheaper, proven fallback . We use this to our advantage.
2.  **Aggressive Caching:** If a user asks the same question twice, or if a common query comes up, serve the answer from a cache. This avoids hitting the LLM API altogether.
3.  **Budget-Aware Fallbacks:** Define clear thresholds for spending. If a request is too expensive, or if a model fails, have a fallback plan, even if it means failing gracefully or escalating to human review.

## Implementing a Simple Routing Table

Here’s a simplified version of the routing logic we use. It's a `switch` statement or a lookup table that maps the `task_type` to the appropriate `model_name` and `max_tokens`.

```python
import os
from typing import Dict, Any
from google.generativeai import GenerativeModel

# Assume these are configured via environment variables or a config file
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

class LLMRouter:
    def __init__(self):
        self.model_configs = {
            "simple_summarization": {"model": "gemini-1.5-flash-latest", "max_output_tokens": 500, "cost_tier": "low"},
            "sentiment_analysis": {"model": "gemini-1.5-flash-latest", "max_output_tokens": 100, "cost_tier": "low"},
            "data_extraction": {"model": "gemini-1.5-pro-latest", "max_output_tokens": 1000, "cost_tier": "medium"},
            "complex_reasoning": {"model": "gemini-1.5-pro-latest", "max_output_tokens": 2000, "cost_tier": "high"},
            "code_generation": {"model": "gemini-1.5-pro-latest", "max_output_tokens": 1500, "cost_tier": "high"},
            "translation_regional": {"model": "gemini-1.5-flash-latest", "max_output_tokens": 300, "cost_tier": "low"},
            "default": {"model": "gemini-1.5-flash-latest", "max_output_tokens": 500, "cost_tier": "low"} # Safe fallback
        }
        self.cache = {}

    def get_model_config(self, task_type: str) -> Dict[str, Any]:
        return self.model_configs.get(task_type, self.model_configs["default"])

    def call_llm(self, task_type: str, prompt: str, use_cache: bool = True) -> str:
        if use_cache and prompt in self.cache:
            print(f"Cache hit for task_type: {task_type}")
            return self.cache[prompt]

        config = self.get_model_config(task_type)
        model_name = config["model"]
        max_output_tokens = config["max_output_tokens"]

        try:
            model = GenerativeModel(model_name=model_name)
            response = model.generate_content(
                prompt,
                generation_config={
                    "max_output_tokens": max_output_tokens,
                    "temperature": 0.7,
                    "top_p": 0.9,
                    "top_k": 40
                }
            )
            result = response.text
            if use_cache:
                self.cache[prompt] = result
            return result
        except Exception as e:
            print(f"Error calling LLM for task {task_type} with model {model_name}: {e}")
            # Implement more robust error handling, e.g., retry with a different model, human fallback
            return "An error occurred or task could not be processed."

# Example Usage:
if __name__ == "__main__":
    # In a real application, you'd set GEMINI_API_KEY in your environment
    # For this example, we'll mock it or ensure it's set for local testing.
    # os.environ["GEMINI_API_KEY"] = "YOUR_GEMINI_API_KEY"

    router = LLMRouter()

    # Simple summarization
    simple_prompt = "Summarize this text in 50 words: The Indian monsoon is a complex weather system that brings much-needed rainfall to the subcontinent, crucial for agriculture and the economy. It typically occurs from June to September."
    summary = router.call_llm("simple_summarization", simple_prompt)
    print(f"\nSimple Summary: {summary}")

    # Complex data extraction (e.g., from a medical report for Sahayaak Seva)
    complex_prompt = "Extract patient name, age, and diagnosis from the following report: 'Patient: Mrs. Anjali Sharma, Age: 45, Diagnosis: Type 2 Diabetes Mellitus, Date: 12/03/2023'"
    extraction = router.call_llm("data_extraction", complex_prompt)
    print(f"\nData Extraction: {extraction}")

    # Repeat simple prompt to test cache
    summary_cached = router.call_llm("simple_summarization", simple_prompt)
    print(f"\nCached Summary: {summary_cached}")

    # Regional language translation (e.g., for KathaKitaab)
    hindi_text = "नमस्ते! आप कैसे हैं?"
    translation_prompt = f"Translate the following Hindi text to English: '{hindi_text}'"
    translation = router.call_llm("translation_regional", translation_prompt)
    print(f"\nRegional Translation: {translation}")
```

### How the Routing Works

1.  **Task Classification:** Before calling the LLM, we classify the user's intent or the internal process's `task_type`. This could be `simple_summarization`, `sentiment_analysis`, `data_extraction`, `complex_reasoning`, or `code_generation`.
2.  **Model Selection:** Based on the `task_type`, our `LLMRouter` selects the most appropriate Gemini model. For quick, less demanding tasks like generating a short summary or translating a regional phrase for KathaKitaab, `gemini-1.5-flash-latest` is sufficient and significantly cheaper. For intricate tasks like extracting structured data from a medical report for Sahayaak Seva, or deep contextual understanding for an AI agent, `gemini-1.5-pro-latest` is chosen.
3.  **Caching Layer:** We implement a simple in-memory cache (though for production, you'd use Redis or a similar distributed cache). Before any API call, we check if the exact prompt has been processed before. If it has, we return the cached result, saving both time and money.
4.  **Error Handling and Fallbacks:** The `try-except` block in `call_llm` is crucial. If an API call fails (e.g., due to rate limits, invalid input, or budget constraints), we can implement retries, switch to a different model, or even flag the request for human review. This is part of our human-gated safety approach at InBharat.

### The Impact: Real Savings

By implementing this, we saw a direct reduction in our API costs. Simple queries, which form a large percentage of user interactions, no longer hit the most expensive models. Caching further reduces redundant calls. For example, in TestsPrep, common questions about exam patterns or syllabus details are almost always served from the cache after the first query.

This approach aligns with our philosophy of building practical AI for Bharat. We're not just chasing the latest, most powerful model; we're optimizing for real-world constraints: cost, latency, and reliability on diverse Indian networks.

## Beyond Simple Routing: Advanced Considerations

While the basic routing table is effective, we're continuously refining it:

*   **Dynamic Cost Analysis:** Integrating real-time cost feedback from the API to dynamically adjust routing. If a `Pro` model suddenly becomes cheaper for a specific task, we can adapt.
*   **Load Balancing:** Distributing requests across multiple model endpoints or even different providers to prevent rate limiting and ensure high availability.
*   **Human-in-the-Loop for Edge Cases:** For queries that are highly ambiguous or exceed a certain cost threshold, we route them to a human expert for review. This is a core part of our human-gated safety, ensuring quality and compliance.
*   **Fine-tuned Models:** For highly specific, repetitive tasks, fine-tuning smaller models can be even more cost-effective than using general-purpose models, even `Flash`. This is something we explore for specific vertical use cases.

This intelligent routing is a critical component of building robust AI agents. As I've discussed in "[AI Agents Aren’t Just Chatbots — They’re the Workforce Multiplier India Needs](https://www.inbharat.ai/learn-ai-with-reeturaj/what-are-ai-agents)", these agents need to be efficient to scale across India. Similarly, effective prompt engineering, as covered in "[Prompt Engineering Is a Real Skill — and Indian Developers Who Master It Will Win](https://www.inbharat.ai/learn-ai-with-reeturaj/prompt-engineering)", complements smart routing by making each model call more effective.

## Bottom Line

Don't let LLM API costs eat into your budget. By implementing a simple, task-aware routing strategy, aggressively caching results, and having budget-conscious fallbacks, you can significantly reduce your operational expenses while maintaining performance. This practical approach is vital for any Indian startup building AI products that need to scale efficiently across the diverse landscape of Bharat. Start with a basic routing table and iterate based on your usage patterns and cost data. You'll be surprised how much you can save.

## FAQ

### Q: What is the main benefit of model routing?
A: The primary benefit is cost reduction. By using less powerful (and cheaper) models for simpler tasks and reserving more expensive, capable models for complex ones, you optimize your API spend. It also improves latency for simple queries.

### Q: How do I determine which model is right for a specific task?
A: Generally, tasks requiring deep contextual understanding, multi-step reasoning, or generating long, creative content benefit from `Gemini 1.5 Pro`. Simpler tasks like summarization, sentiment analysis, or short translations are well-suited for `Gemini 1.5 Flash`. Experimentation with your specific use case is key.

### Q: Is caching really that effective for LLM calls?
A: Yes, incredibly so. Many user queries are repetitive, especially for information retrieval or common questions. Caching these responses eliminates redundant API calls, saving significant cost and improving response times. A simple key-value store based on the prompt text works wonders.

### Q: What if a task requires a powerful model but my budget is very tight?
A: Consider a multi-stage approach. First, try a simpler model with a constrained prompt. If it fails or the quality is insufficient, then escalate to a more powerful model. For critical tasks, you might also implement a human review fallback, especially if the cost of an incorrect AI output is high.