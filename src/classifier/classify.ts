/**
 * Main complexity classification function
 * 
 * Analyzes conversation messages and returns complexity tier with confidence
 */

import { extractKeywords, analyzeStructuralSignals, type ComplexityTier } from './signals.js';
import { scoreComplexity, type TierScores } from './scoring.js';

export interface Message {
  role: "system" | "user" | "assistant" | "tool";
  content: string | ContentBlock[];
  tool_calls?: unknown[];
  tool_use?: unknown[];
  [key: string]: unknown;
}

export interface ContentBlock {
  type: string;
  text?: string;
  content?: string;
  [key: string]: unknown;
}

export interface ClassificationResult {
  tier: ComplexityTier;
  confidence: number;
  reason: string;
  scores: Record<ComplexityTier, number>;
  signals: string[];
}

/**
 * Main classification function
 * Analyzes conversation messages and returns complexity classification
 */
export function classifyComplexity(messages: Message[]): ClassificationResult {
  // Handle edge cases
  if (!messages || messages.length === 0) {
    return {
      tier: "simple",
      confidence: 0.5,
      reason: "empty conversation defaults to simple",
      scores: { simple: 1.0, mid: 0.0, complex: 0.0, reasoning: 0.0 },
      signals: ["structural:empty-conversation"]
    };
  }

  // Focus analysis on recent messages (last 3) and user messages primarily
  const analysisMessages = getAnalysisMessages(messages);
  
  // Extract text content from messages
  const analysisText = extractTextContent(analysisMessages);
  
  // Analyze keyword-based signals
  const keywords = extractKeywords(analysisText);
  
  // Analyze structural characteristics
  const structuralSignals = analyzeStructuralSignals(messages);
  
  // Apply historical context boost
  const historicalSignals = analyzeHistoricalContext(messages);
  
  // Score the complexity
  const scoringResult = scoreComplexity(keywords, {
    ...structuralSignals,
    complexityIndicators: [...structuralSignals.complexityIndicators, ...historicalSignals]
  });

  // Apply conversation context adjustments
  const finalResult = applyConversationContext(scoringResult, messages);

  return {
    tier: finalResult.tier,
    confidence: finalResult.confidence,
    reason: finalResult.reason,
    scores: finalResult.scores,
    signals: finalResult.signals
  };
}

/**
 * Select most relevant messages for analysis
 * Prioritizes recent messages and user inputs
 */
function getAnalysisMessages(messages: Message[]): Message[] {
  // Take last 3 messages but prioritize user messages
  const recentMessages = messages.slice(-3);
  
  // Also include the last user message if not in recent set
  const lastUserMessage = [...messages].reverse().find(m => m.role === 'user');
  
  const analysisSet = new Set<Message>();
  
  // Add recent messages
  recentMessages.forEach(m => analysisSet.add(m));
  
  // Add last user message if different
  if (lastUserMessage && !recentMessages.includes(lastUserMessage)) {
    analysisSet.add(lastUserMessage);
  }
  
  return Array.from(analysisSet);
}

/**
 * Extract plain text content from messages
 */
function extractTextContent(messages: Message[]): string {
  const textParts: string[] = [];
  
  for (const message of messages) {
    if (typeof message.content === 'string') {
      textParts.push(message.content);
    } else if (Array.isArray(message.content)) {
      for (const block of message.content) {
        if (block.text) {
          textParts.push(block.text);
        } else if (block.content && typeof block.content === 'string') {
          textParts.push(block.content);
        }
      }
    }
  }
  
  return textParts.join(' ');
}

/**
 * Analyze conversation history for complexity patterns
 */
function analyzeHistoricalContext(messages: Message[]): string[] {
  const historicalSignals: string[] = [];
  
  // Look for escalating complexity in conversation
  const userMessages = messages.filter(m => m.role === 'user');
  
  if (userMessages.length > 1) {
    const lengths = userMessages.map(m => extractTextContent([m]).length);
    const avgLength = lengths.reduce((a, b) => a + b, 0) / lengths.length;
    
    if (avgLength > 1000) {
      historicalSignals.push('lengthy conversation pattern');
    }
    
    // Check for escalation - later messages much longer than earlier ones
    if (lengths.length >= 2) {
      const earlyAvg = lengths.slice(0, Math.ceil(lengths.length / 2)).reduce((a, b) => a + b, 0) / Math.ceil(lengths.length / 2);
      const lateAvg = lengths.slice(Math.floor(lengths.length / 2)).reduce((a, b) => a + b, 0) / Math.ceil(lengths.length / 2);
      
      if (lateAvg > earlyAvg * 2) {
        historicalSignals.push('escalating complexity');
      }
    }
  }
  
  // Count tool usage across conversation
  const toolMessages = messages.filter(m => 
    m.role === 'tool' || 
    m.tool_calls?.length || 
    m.tool_use?.length
  ).length;
  
  if (toolMessages > 2) {
    historicalSignals.push('heavy tool usage');
  } else if (toolMessages > 0) {
    historicalSignals.push('moderate tool usage');
  }
  
  // Look for multi-turn debugging/problem-solving patterns
  const problemKeywords = ['error', 'issue', 'problem', 'debug', 'fix', 'not working'];
  const problemMessages = userMessages.filter(m => {
    const text = extractTextContent([m]).toLowerCase();
    return problemKeywords.some(keyword => text.includes(keyword));
  });
  
  if (problemMessages.length > 1) {
    historicalSignals.push('iterative problem solving');
  }
  
  return historicalSignals;
}

/**
 * Apply conversation-specific context adjustments
 */
function applyConversationContext(
  scoringResult: {
    scores: TierScores;
    tier: ComplexityTier;
    confidence: number;
    reason: string;
    signals: string[];
  },
  messages: Message[]
): typeof scoringResult {
  let adjustedScores = { ...scoringResult.scores };
  let contextReason = scoringResult.reason;
  
  // Boost reasoning tier for mathematical content
  const allText = extractTextContent(messages).toLowerCase();
  const mathIndicators = ['equation', 'formula', 'calculate', 'solve', 'proof', 'theorem', 'mathematical'];
  const mathMatches = mathIndicators.filter(indicator => allText.includes(indicator));
  
  if (mathMatches.length > 0) {
    adjustedScores.reasoning += 0.2;
    contextReason += ` (mathematical content detected: ${mathMatches.join(', ')})`;
  }
  
  // Boost complex tier for architectural discussions
  const archIndicators = ['architecture', 'design pattern', 'scalability', 'microservices', 'system design'];
  const archMatches = archIndicators.filter(indicator => allText.includes(indicator));
  
  if (archMatches.length > 0) {
    adjustedScores.complex += 0.3;
    contextReason += ` (architectural discussion detected)`;
  }
  
  // Reduce to simple for very short conversations
  if (messages.length <= 2 && extractTextContent(messages).length < 100) {
    adjustedScores.simple += 0.3;
    contextReason += ` (very brief conversation)`;
  }
  
  // Re-normalize and re-resolve if scores changed significantly
  const totalAdjustment = Object.values(adjustedScores).reduce((a, b) => a + b, 0) - 
                         Object.values(scoringResult.scores).reduce((a, b) => a + b, 0);
  
  if (Math.abs(totalAdjustment) > 0.1) {
    // Renormalize
    const sum = adjustedScores.simple + adjustedScores.mid + adjustedScores.complex + adjustedScores.reasoning;
    adjustedScores = {
      simple: adjustedScores.simple / sum,
      mid: adjustedScores.mid / sum,
      complex: adjustedScores.complex / sum,
      reasoning: adjustedScores.reasoning / sum
    };
    
    // Re-resolve tier
    const tiers = Object.keys(adjustedScores) as ComplexityTier[];
    let bestTier: ComplexityTier = 'complex';
    let maxScore = 0;
    
    for (const tier of tiers) {
      if (adjustedScores[tier] > maxScore) {
        maxScore = adjustedScores[tier];
        bestTier = tier;
      }
    }
    
    // Recalculate confidence
    const sortedScores = tiers
      .map(tier => ({ tier, score: adjustedScores[tier] }))
      .sort((a, b) => b.score - a.score);
    
    const margin = sortedScores[0].score - (sortedScores[1]?.score || 0);
    const confidence = Math.min(1.0, 0.5 + margin);
    
    return {
      scores: adjustedScores,
      tier: bestTier,
      confidence: Math.round(confidence * 100) / 100,
      reason: contextReason,
      signals: scoringResult.signals
    };
  }
  
  return {
    ...scoringResult,
    reason: contextReason
  };
}

/**
 * Helper function for quick tier classification without detailed analysis
 * Useful for lightweight checks or fallbacks
 */
export function classifyQuickTier(text: string): ComplexityTier {
  const lowerText = text.toLowerCase();
  
  // Quick keyword checks (order matters - check more complex first)
  const reasoningKeywords = ['prove', 'strategy', 'strategic', 'ethical', 'philosophy', 'theorem'];
  const complexKeywords = ['debug', 'debugging', 'architecture', 'implement', 'optimize', 'performance'];
  const midKeywords = ['explain', 'describe', 'how does', 'what is', 'how to'];
  const simpleKeywords = ['hello', 'hi', 'hey', 'yes', 'no', 'thanks', 'thank you'];
  
  if (reasoningKeywords.some(k => lowerText.includes(k))) return 'reasoning';
  if (complexKeywords.some(k => lowerText.includes(k))) return 'complex';
  if (midKeywords.some(k => lowerText.includes(k))) return 'mid';
  if (simpleKeywords.some(k => lowerText.includes(k))) return 'simple';
  
  // Fallback based on length
  if (text.length < 50) return 'simple';
  if (text.length > 2000) return 'reasoning';
  if (text.length > 1000) return 'complex';
  if (text.length > 200) return 'mid';
  
  return 'simple';
}