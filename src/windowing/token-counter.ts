/**
 * Token estimation utilities for message counting
 * Fast approximation without tokenizer dependency
 */

export interface Message {
  role: "system" | "user" | "assistant" | "tool";
  content: string | ContentBlock[];
  tool_calls?: unknown[];
  tool_use?: unknown[];
  cache_control?: { type: "ephemeral" };
  [key: string]: unknown;
}

export interface ContentBlock {
  type: string;
  text?: string;
  [key: string]: unknown;
}

/**
 * Estimate token count using fast approximation
 * Rule: ~4 characters ≈ 1 token (OpenAI/Anthropic baseline)
 */
export function estimateTokens(messages: Message[]): number {
  let totalChars = 0;

  for (const message of messages) {
    // Role overhead (~5 tokens per message for formatting)
    totalChars += 20;

    // Content tokens
    if (typeof message.content === 'string') {
      totalChars += message.content.length;
    } else if (Array.isArray(message.content)) {
      for (const block of message.content) {
        if (block.text) {
          totalChars += block.text.length;
        }
        // Add overhead for structured content (tool calls, images, etc.)
        totalChars += JSON.stringify(block).length * 0.5;
      }
    }

    // Tool call overhead
    if (message.tool_calls) {
      totalChars += JSON.stringify(message.tool_calls).length;
    }
    if (message.tool_use) {
      totalChars += JSON.stringify(message.tool_use).length;
    }
  }

  // Convert chars to tokens (4 chars ≈ 1 token)
  return Math.ceil(totalChars / 4);
}

/**
 * Estimate tokens for a single message
 */
export function estimateMessageTokens(message: Message): number {
  return estimateTokens([message]);
}

/**
 * More precise token estimation for content strings
 * Accounts for whitespace, punctuation, and common patterns
 */
export function estimateContentTokens(content: string): number {
  if (!content || content.length === 0) return 0;

  // Split by common token boundaries
  const words = content
    .split(/[\s\n\r\t]+/)
    .filter(word => word.length > 0);

  let tokenCount = 0;

  for (const word of words) {
    // Short words (~1 token each)
    if (word.length <= 4) {
      tokenCount += 1;
    }
    // Medium words (~1-2 tokens)
    else if (word.length <= 8) {
      tokenCount += 1.5;
    }
    // Long words (split into sub-tokens)
    else {
      tokenCount += Math.ceil(word.length / 4);
    }
  }

  // Add overhead for punctuation and formatting
  const punctuationCount = (content.match(/[.!?;:,(){}[\]"'-]/g) || []).length;
  tokenCount += punctuationCount * 0.5;

  return Math.ceil(tokenCount);
}

/**
 * Calculate token savings between original and windowed messages
 */
export function calculateTokenSavings(
  originalMessages: Message[],
  windowedMessages: Message[]
): {
  originalTokens: number;
  windowedTokens: number;
  tokensSaved: number;
  percentageSaved: number;
} {
  const originalTokens = estimateTokens(originalMessages);
  const windowedTokens = estimateTokens(windowedMessages);
  const tokensSaved = originalTokens - windowedTokens;
  const percentageSaved = originalTokens > 0 
    ? (tokensSaved / originalTokens) * 100 
    : 0;

  return {
    originalTokens,
    windowedTokens,
    tokensSaved,
    percentageSaved,
  };
}