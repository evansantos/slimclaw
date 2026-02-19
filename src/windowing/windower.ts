/**
 * Core conversation windowing implementation
 * Maintains fixed window + context summary for long conversations
 */

import type { Message } from './token-counter.js';
import { estimateTokens } from './token-counter.js';
import { generateSummary } from './summarizer.js';

export interface WindowingConfig {
  /** Maximum messages to keep in recent window */
  maxMessages: number;
  /** Maximum tokens in recent window (overrides maxMessages if hit first) */
  maxTokens?: number;
  /** Start summarizing when message count exceeds this threshold */
  summarizeThreshold: number;
  /** Use LLM for summarization instead of heuristic (not implemented in MVP) */
  llmSummarize?: boolean;
  /** Maximum tokens for context summary */
  maxSummaryTokens?: number;
}

export interface WindowedConversation {
  /** Original system prompt (extracted, unmodified) */
  systemPrompt: string;
  /** Summary of messages that were trimmed from the window */
  contextSummary: string | null;
  /** Messages kept in the active window */
  recentMessages: Message[];
  /** Metadata for metrics and debugging */
  meta: {
    originalMessageCount: number;
    windowedMessageCount: number;
    trimmedMessageCount: number;
    originalTokenEstimate: number;
    windowedTokenEstimate: number;
    summaryTokenEstimate: number;
    summarizationMethod: "none" | "heuristic" | "llm";
  };
}

const DEFAULT_WINDOWING_CONFIG: WindowingConfig = {
  maxMessages: 10,
  maxTokens: 4000,
  summarizeThreshold: 8,
  llmSummarize: false,
  maxSummaryTokens: 500,
};

/**
 * Apply conversation windowing to message history
 * Keeps recent messages + summary of older context
 */
export function windowConversation(
  messages: Message[], 
  config: Partial<WindowingConfig> = {}
): WindowedConversation {
  const finalConfig: WindowingConfig = {
    ...DEFAULT_WINDOWING_CONFIG,
    ...config,
  };

  if (messages.length === 0) {
    return {
      systemPrompt: '',
      contextSummary: null,
      recentMessages: [],
      meta: {
        originalMessageCount: 0,
        windowedMessageCount: 0,
        trimmedMessageCount: 0,
        originalTokenEstimate: 0,
        windowedTokenEstimate: 0,
        summaryTokenEstimate: 0,
        summarizationMethod: "none",
      },
    };
  }

  // Extract system prompt (should be first message)
  const systemPrompt = extractSystemPrompt(messages);
  const nonSystemMessages = messages.filter(msg => msg.role !== 'system');

  // Check if windowing is needed
  if (!needsWindowing(nonSystemMessages, finalConfig)) {
    const originalTokens = estimateTokens(messages);
    return {
      systemPrompt,
      contextSummary: null,
      recentMessages: nonSystemMessages,
      meta: {
        originalMessageCount: messages.length,
        windowedMessageCount: messages.length,
        trimmedMessageCount: 0,
        originalTokenEstimate: originalTokens,
        windowedTokenEstimate: originalTokens,
        summaryTokenEstimate: 0,
        summarizationMethod: "none",
      },
    };
  }

  // Determine split point for windowing
  const splitPoint = calculateSplitPoint(nonSystemMessages, finalConfig);
  
  // Split messages: old (to summarize) vs recent (to keep)
  const messagesToSummarize = nonSystemMessages.slice(0, splitPoint);
  const recentMessages = nonSystemMessages.slice(splitPoint);

  // Generate summary of old messages
  const summaryResult = generateSummary(messagesToSummarize);
  const contextSummary = summaryResult.summary || null;

  // Calculate token estimates
  const originalTokens = estimateTokens(messages);
  const windowedMessages = [
    ...(systemPrompt ? [{ role: 'system' as const, content: systemPrompt }] : []),
    ...recentMessages,
  ];
  const windowedTokens = estimateTokens(windowedMessages);
  const summaryTokens = contextSummary ? estimateTokens([{ role: 'system', content: contextSummary }]) : 0;
  
  // Determine summarization method
  const summarizationMethod = contextSummary ? "heuristic" : "none";

  return {
    systemPrompt,
    contextSummary,
    recentMessages,
    meta: {
      originalMessageCount: messages.length,
      windowedMessageCount: recentMessages.length + (systemPrompt ? 1 : 0),
      trimmedMessageCount: messages.length - (recentMessages.length + (systemPrompt ? 1 : 0)),
      originalTokenEstimate: originalTokens,
      windowedTokenEstimate: windowedTokens,
      summaryTokenEstimate: summaryTokens,
      summarizationMethod,
    },
  };
}

/**
 * Rebuild message array from windowed conversation for API submission
 */
export function buildWindowedMessages(windowed: WindowedConversation): Message[] {
  const messages: Message[] = [];

  // Reconstruct system prompt with context summary
  let systemContent = windowed.systemPrompt;
  if (windowed.contextSummary) {
    systemContent += `\n\n<context_summary>\n${windowed.contextSummary}\n</context_summary>`;
  }

  // Add system message if we have content
  if (systemContent.trim()) {
    messages.push({
      role: 'system',
      content: systemContent,
    });
  }

  // Add recent messages
  messages.push(...windowed.recentMessages);

  return messages;
}

/**
 * Extract system prompt from messages
 */
function extractSystemPrompt(messages: Message[]): string {
  const systemMessage = messages.find(msg => msg.role === 'system');
  
  if (!systemMessage) return '';
  
  if (typeof systemMessage.content === 'string') {
    return systemMessage.content;
  }
  
  // Handle ContentBlock[] format
  if (Array.isArray(systemMessage.content)) {
    return systemMessage.content
      .map(block => block.text || '')
      .filter(text => text.length > 0)
      .join('\n');
  }
  
  return '';
}

/**
 * Determine if windowing is needed based on config thresholds
 */
function needsWindowing(messages: Message[], config: WindowingConfig): boolean {
  // Check message count threshold
  if (messages.length <= config.summarizeThreshold) {
    return false;
  }

  // Check token threshold if configured
  if (config.maxTokens) {
    const tokenCount = estimateTokens(messages);
    if (tokenCount <= config.maxTokens) {
      return false;
    }
  }

  return true;
}

/**
 * Calculate where to split messages for windowing
 * Returns index of first message to keep in recent window
 */
function calculateSplitPoint(messages: Message[], config: WindowingConfig): number {
  const totalMessages = messages.length;
  
  // Start with simple message-based split
  let splitPoint = Math.max(0, totalMessages - config.maxMessages);
  
  // Adjust for token budget if configured
  if (config.maxTokens) {
    splitPoint = adjustSplitPointForTokens(messages, splitPoint, config.maxTokens);
  }
  
  // Ensure we don't split in the middle of a conversation turn
  splitPoint = adjustSplitPointForConversationFlow(messages, splitPoint);
  
  return splitPoint;
}

/**
 * Adjust split point to respect token budget
 */
function adjustSplitPointForTokens(
  messages: Message[], 
  initialSplitPoint: number, 
  maxTokens: number
): number {
  let splitPoint = initialSplitPoint;
  
  // Count tokens from split point to end
  while (splitPoint < messages.length) {
    const recentMessages = messages.slice(splitPoint);
    const tokenCount = estimateTokens(recentMessages);
    
    if (tokenCount <= maxTokens) {
      break; // This split point works
    }
    
    splitPoint++; // Try keeping fewer messages
  }
  
  return Math.min(splitPoint, messages.length);
}

/**
 * Adjust split point to avoid breaking conversation flow
 * Try to split at natural conversation boundaries
 */
function adjustSplitPointForConversationFlow(
  messages: Message[], 
  splitPoint: number
): number {
  if (splitPoint <= 0 || splitPoint >= messages.length) {
    return splitPoint;
  }
  
  // Look for good splitting points within a small window
  const searchWindow = Math.min(3, splitPoint);
  
  for (let offset = 0; offset < searchWindow; offset++) {
    const candidatePoint = splitPoint - offset;
    
    if (candidatePoint <= 0) break;
    
    const messageAtPoint = messages[candidatePoint];
    
    // Prefer to split after assistant messages (end of assistant turn)
    if (messageAtPoint.role === 'assistant') {
      return candidatePoint + 1;
    }
    
    // Or after user messages that look like conversation starters
    if (messageAtPoint.role === 'user' && isConversationStarter(messageAtPoint)) {
      return candidatePoint;
    }
  }
  
  return splitPoint;
}

/**
 * Check if a user message looks like a conversation starter
 */
function isConversationStarter(message: Message): boolean {
  const content = typeof message.content === 'string' 
    ? message.content 
    : JSON.stringify(message.content);
  
  const lower = content.toLowerCase();
  
  const starterPatterns = [
    'hi', 'hello', 'hey',
    'can you help',
    'i need',
    'i want to',
    'let\'s',
    'new task',
    'another question',
  ];
  
  return starterPatterns.some(pattern => lower.includes(pattern));
}

/**
 * Utility function to get windowing stats without applying windowing
 */
export function analyzeConversationStats(messages: Message[]): {
  totalMessages: number;
  totalTokens: number;
  nonSystemMessages: number;
  hasSystemPrompt: boolean;
  averageMessageLength: number;
} {
  const totalTokens = estimateTokens(messages);
  const hasSystemPrompt = messages.some(msg => msg.role === 'system');
  const nonSystemMessages = messages.filter(msg => msg.role !== 'system');
  
  const totalContentLength = messages.reduce((sum, msg) => {
    const content = typeof msg.content === 'string' 
      ? msg.content 
      : JSON.stringify(msg.content);
    return sum + content.length;
  }, 0);
  
  const averageMessageLength = messages.length > 0 
    ? Math.round(totalContentLength / messages.length)
    : 0;
  
  return {
    totalMessages: messages.length,
    totalTokens,
    nonSystemMessages: nonSystemMessages.length,
    hasSystemPrompt,
    averageMessageLength,
  };
}