/**
 * ClawRouter-based classifier implementation
 * 
 * Uses the hybrid routing system from Task 1 to provide model routing decisions
 * as complexity classifications, bridging the routing and classification systems.
 */

import type { Message, ClassificationResult } from './classify.js';
import type { ComplexityTier } from './signals.js';
import { HybridRouter } from '../routing/hybrid-router.js';
import { ClawRouterAdapter } from '../routing/clawrouter-adapter.js';
import { HeuristicProvider } from '../routing/heuristic-provider.js';
import type { RoutingDecision } from '../routing/types.js';

/**
 * Singleton hybrid router instance (lazy initialization)
 */
let hybridRouterInstance: HybridRouter | null = null;

/**
 * Get or create the singleton hybrid router instance
 */
function getHybridRouter(): HybridRouter {
  if (!hybridRouterInstance) {
    const clawRouterAdapter = new ClawRouterAdapter();
    const heuristicProvider = new HeuristicProvider();
    hybridRouterInstance = new HybridRouter(clawRouterAdapter, heuristicProvider);
  }
  return hybridRouterInstance;
}

/**
 * Extract plain text content from messages
 * Similar to extractTextContent in classify.ts but exported for reuse
 */
export function extractTextFromMessages(messages: Message[]): string {
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
 * Calculate approximate token count from text content
 * Uses a simple heuristic: ~4 characters per token (GPT-style tokenization approximation)
 */
function calculateContextTokens(text: string): number {
  if (!text) return 0;
  
  // Rough approximation: 4 characters per token on average
  // This is a simplified heuristic, real tokenization would be more accurate
  return Math.ceil(text.length / 4);
}

/**
 * Map RoutingDecision to ClassificationResult
 * Converts the routing system's output to the classifier's expected format
 */
function mapRoutingDecisionToClassification(
  decision: RoutingDecision,
  text: string,
  isFromFallback: boolean = false
): ClassificationResult {
  const validTiers = new Set(['simple', 'mid', 'complex', 'reasoning']);
  const normalized = decision.tier.toLowerCase();
  const tier = (validTiers.has(normalized) ? normalized : 'mid') as ComplexityTier;
  
  // Generate reason string
  const source = isFromFallback ? 'fallback heuristic' : 'router';
  const reason = `${source} classified as ${tier} tier using ${decision.model} (confidence: ${decision.confidence.toFixed(2)})`;
  
  // Create scores object with emphasis on the selected tier
  const scores: Record<ComplexityTier, number> = {
    simple: tier === 'simple' ? decision.confidence : (1 - decision.confidence) / 3,
    mid: tier === 'mid' ? decision.confidence : (1 - decision.confidence) / 3,
    complex: tier === 'complex' ? decision.confidence : (1 - decision.confidence) / 3,
    reasoning: tier === 'reasoning' ? decision.confidence : (1 - decision.confidence) / 3
  };
  
  // Normalize scores to sum to 1
  const totalScore = Object.values(scores).reduce((sum, score) => sum + score, 0);
  if (totalScore > 0) {
    for (const key in scores) {
      scores[key as ComplexityTier] = scores[key as ComplexityTier] / totalScore;
    }
  }
  
  // Generate signals
  const signals: string[] = [];
  if (isFromFallback) {
    signals.push('router:fallback');
  } else {
    signals.push('router:primary');
  }
  
  signals.push(`model:${decision.model}`);
  signals.push(`tier:${tier}`);
  
  if (decision.confidence > 0.8) {
    signals.push('high-confidence');
  } else if (decision.confidence < 0.5) {
    signals.push('low-confidence');
  }
  
  if (text.length > 1000) {
    signals.push('lengthy-content');
  }

  return {
    tier,
    confidence: decision.confidence,
    reason,
    scores,
    signals
  };
}

/**
 * Create fallback classification result when router fails
 */
function createFallbackResult(): ClassificationResult {
  return {
    tier: 'simple',
    confidence: 0.5,
    reason: 'fallback classification due to router failure',
    scores: { simple: 0.5, mid: 0.3, complex: 0.15, reasoning: 0.05 },
    signals: ['router:fallback', 'router:error']
  };
}

/**
 * Classify messages using the hybrid router system
 * 
 * This function bridges the routing and classification systems by using
 * the routing providers to make complexity determinations.
 * 
 * @param messages - Array of conversation messages to classify
 * @param config - Optional configuration to pass to the router
 * @returns ClassificationResult with complexity tier and confidence
 */
export function classifyWithRouter(
  messages: Message[],
  config?: Record<string, unknown>
): ClassificationResult {
  try {
    // Extract text from messages
    const text = extractTextFromMessages(messages);
    
    // Calculate context tokens
    const contextTokens = calculateContextTokens(text);
    
    // Get router instance and route
    const router = getHybridRouter();
    const decision = router.route(text, contextTokens, config);
    
    // Map to classification result
    return mapRoutingDecisionToClassification(decision, text, false);
    
  } catch (error) {
    // Router failed, return fallback result
    return createFallbackResult();
  }
}

/**
 * Export the singleton router instance (for testing and direct access)
 */
export { getHybridRouter };