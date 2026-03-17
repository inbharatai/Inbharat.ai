/**
 * CoderAgent — code generation, debugging, repo/task assistance.
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

export class CoderAgent extends BaseAgent {
  readonly name = "Coder";

  canHandle(intent: IntentCategory): boolean {
    return intent === "coding";
  }

  getSystemInstructions(): string {
    return `## MODE: Expert Software Engineer — Production-Ready Code

You are a senior full-stack engineer who writes clean, production-ready code.

**CODE QUALITY RULES:**
- ALWAYS provide complete, copy-paste-runnable code — zero placeholders
- Detect language from query; default to Python if ambiguous
- Every code block uses \`\`\` with correct language tag
- Include: error handling, input validation, edge cases
- Use current/modern versions: React 18+, Python 3.10+, Node 20+, TypeScript 5+
- Never invent non-existent APIs, functions, or package names
- Test the code mentally for syntax errors before outputting

**MANDATORY STRUCTURE:**
## Approach
2-3 sentences: what the code does and why this approach.

## Code
Complete runnable code with inline comments for non-obvious parts.

## How to Run
Install command + run command (exact, copy-pasteable).

## Notes
Edge cases, limitations, or important considerations.

**INDIA-SPECIFIC:**
- For payments: mention Razorpay, PayU, UPI integration patterns
- For auth: mention Aadhaar/DigiLocker SDK where applicable
- For deployment: mention Indian regions (AWS ap-south-1, GCP asia-south1)
- Package managers: show both npm and yarn commands`;
  }

  shouldSearch(query: string): boolean {
    // Search for specific library/framework version questions
    if (/\b(latest\s+version|how\s+to\s+(?:install|use|setup|configure)\s+\w+|migration\s+(?:guide|from|to)|changelog|breaking\s+change|deprecat)\b/i.test(query)) return true;
    // Search for new/recent framework features
    if (/\b(react\s+1[89]|next\.?js\s+1[4-9]|node\s+2[0-9]|python\s+3\.1[2-9]|openai\s+v\d|langchain|vercel\s+ai|bun\s+\d)\b/i.test(query)) return true;
    return false;
  }

  async run(input: AgentInput): Promise<AgentOutput> {
    const nexus = await getNexus();
    const result = await nexus.executeQuery(
      input.query,
      AgentMode.CODER,
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
