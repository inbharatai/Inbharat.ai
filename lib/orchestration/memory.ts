/**
 * Conversation memory manager — smart context window for LLM calls.
 *
 * Instead of naively slicing the last N messages, this:
 *  1. Prioritizes the most recent exchange (current user question + last answer)
 *  2. Includes system-relevant context from earlier messages
 *  3. Estimatess token usage to stay within budget
 *  4. Generates a compact summary of pruned messages
 */

/** Rough token estimate: ~4 chars per token for English, ~2 for CJK/Indic. */
export function estimateTokens(text: string): number {
  // Count characters that are likely multi-byte (Indic, CJK, Arabic)
  const multiByte = (text.match(/[\u0900-\u0D7F\u0600-\u06FF\u4E00-\u9FFF\u3000-\u303F]/g) || []).length;
  const singleByte = text.length - multiByte;
  return Math.ceil(singleByte / 4 + multiByte / 2);
}

export interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ContextWindow {
  /** Messages to include in the LLM call (after system prompt). */
  messages: ConversationMessage[];
  /** Compact summary of pruned older messages (prepended to system prompt). */
  contextSummary: string;
  /** Estimated token count for the context. */
  estimatedTokens: number;
}

/**
 * Build an optimized context window from conversation history.
 *
 * @param history - Full conversation history (newest last)
 * @param maxTokenBudget - Max tokens to allocate for context (default: 4000)
 * @param systemPromptTokens - Estimated tokens in the system prompt (default: 800)
 * @param userMessageTokens - Estimated tokens in the current user message (default: 100)
 */
export function buildContextWindow(
  history: ConversationMessage[],
  maxTokenBudget: number = 4000,
  systemPromptTokens: number = 800,
  userMessageTokens: number = 100,
): ContextWindow {
  if (history.length === 0) {
    return { messages: [], contextSummary: "", estimatedTokens: 0 };
  }

  // Reserve budget for system prompt AND current user message
  const availableTokens = Math.max(200, maxTokenBudget - systemPromptTokens - userMessageTokens);
  // Filter out empty/whitespace-only messages
  const validHistory = history.filter(m => m.content && m.content.trim().length > 0);
  if (validHistory.length === 0) {
    return { messages: [], contextSummary: "", estimatedTokens: 0 };
  }
  const result: ConversationMessage[] = [];
  let totalTokens = 0;

  // Always include the most recent messages first (reverse iteration)
  for (let i = validHistory.length - 1; i >= 0; i--) {
    const msg = validHistory[i];
    const tokens = estimateTokens(msg.content);

    if (totalTokens + tokens > availableTokens && result.length >= 2) {
      // Over budget — summarize remaining older messages
      const older = validHistory.slice(0, i + 1);
      const summary = summarizeOlderMessages(older);
      return {
        messages: result.reverse(),
        contextSummary: summary,
        estimatedTokens: totalTokens + estimateTokens(summary),
      };
    }

    result.push(msg);
    totalTokens += tokens;
  }

  return {
    messages: result.reverse(),
    contextSummary: "",
    estimatedTokens: totalTokens,
  };
}

/**
 * Create a compact summary of older pruned messages.
 */
function summarizeOlderMessages(messages: ConversationMessage[]): string {
  if (messages.length === 0) return "";

  const topics: string[] = [];
  for (const msg of messages) {
    if (msg.role === "user") {
      // Extract first 80 chars of each user message as a topic hint
      const snippet = msg.content.slice(0, 80).replace(/\n/g, " ").trim();
      if (snippet) topics.push(snippet);
    }
  }

  if (topics.length === 0) return "";

  return `[Earlier in this conversation, the user discussed: ${topics.slice(-5).join("; ")}]`;
}

/**
 * Extract key entities and topics from a conversation for long-term memory.
 * Returns a list of topic strings that can be stored in Supabase for retrieval.
 */
export function extractTopics(messages: ConversationMessage[]): string[] {
  const topics = new Set<string>();
  for (const msg of messages) {
    if (msg.role !== "user") continue;
    // Extract quoted terms, capitalized proper nouns, and explicit topic markers
    const quoted = msg.content.match(/"([^"]+)"/g);
    if (quoted) quoted.forEach(q => topics.add(q.replace(/"/g, "")));

    // Extract potential proper nouns (2+ word capitalized sequences)
    const properNouns = msg.content.match(/(?:[A-Z][a-z]+\s){1,3}[A-Z][a-z]+/g);
    if (properNouns) properNouns.forEach(n => topics.add(n.trim()));
  }
  return Array.from(topics).slice(0, 10);
}
