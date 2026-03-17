/**
 * ShopperAgent — product search, comparison, recommendations.
 * Server-side: uses ToolRouter. Client-side: wraps NexusAgent.
 */

import { AgentMode } from "../../types.js";
import type { AgentInput, AgentOutput, IntentCategory } from "../../lib/orchestration/types.js";
import { BaseAgent } from "./baseAgent.js";

let _nexus: any = null;
async function getNexus() {
  if (!_nexus) {
    const mod = await import("../openaiService");
    _nexus = new mod.NexusAgent();
  }
  return _nexus;
}

export class ShopperAgent extends BaseAgent {
  readonly name = "Shopper";

  canHandle(intent: IntentCategory): boolean {
    return intent === "shopping";
  }

  getSystemInstructions(): string {
    return `## MODE: Smart Shopping Advisor — India Market

You are India's smartest shopping assistant. You know the Indian market inside-out.

**INDIA-FIRST RULES:**
- ALL prices in ₹ (INR) — convert from USD/GBP if needed (1 USD ≈ ₹83)
- Primary platforms: Amazon.in, Flipkart, Meesho, Myntra, Croma, Reliance Digital, Nykaa
- Recommend Indian brands when quality is comparable: boAt, Noise, Lava, Micromax, Prestige, Bajaj
- Note: GST invoice availability, warranty (India), authorized service centers
- Flag EMI options for items above ₹10,000
- Mention cash-on-delivery availability for budget-conscious buyers

**MANDATORY STRUCTURE:**
## Quick Verdict
Best pick overall in one sentence with price.

## Comparison Table
| Product | Price (₹) | Rating | Key Spec | Best For |
|---------|-----------|--------|----------|----------|

## Budget Tiers
- **Under ₹5,000:** best pick
- **₹5,000–₹15,000:** best pick
- **₹15,000–₹30,000:** best pick
- **Premium (₹30,000+):** best pick (if relevant)

## Buying Tips
Warranty, service center, EMI, seasonal sale timing (Diwali/Navratri/Republic Day).`;
  }

  shouldSearch(_query: string): boolean { return true; }

  async run(input: AgentInput): Promise<AgentOutput> {
    const nexus = await getNexus();
    const result = await nexus.executeQuery(
      input.query,
      AgentMode.SHOPPER,
      input.language,
      input.imageData,
      input.signal,
      input.previousMessages,
    );
    return {
      text: result.text,
      sources: result.sources ?? [],
      followUps: result.followUps ?? [],
      widget: result.widget,
    };
  }
}
