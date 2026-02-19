/**
 * SlimClaw Complexity Classifier
 * 
 * Heuristic-based complexity classification for model routing
 * 
 * @example
 * ```typescript
 * import { classifyComplexity } from './classifier/index.js';
 * 
 * const messages = [
 *   { role: 'user', content: 'Help me debug this performance issue in my React app' }
 * ];
 * 
 * const result = classifyComplexity(messages);
 * console.log(`Classified as ${result.tier} (${result.confidence} confidence)`);
 * // => "Classified as complex (0.82 confidence)"
 * ```
 */

// Main classification functions
export { 
  classifyComplexity, 
  classifyQuickTier,
  type Message,
  type ContentBlock,
  type ClassificationResult 
} from './classify.js';

// ClawRouter-based classification
export { 
  classifyWithRouter,
  extractTextFromMessages,
  getHybridRouter,
  resetHybridRouter
} from './clawrouter-classifier.js';

// Types and interfaces
export type { 
  ComplexityTier, 
  ComplexitySignal, 
  StructuralSignals 
} from './signals.js';

export type { 
  TierScores, 
  ScoringResult 
} from './scoring.js';

// Signal analysis utilities
export { 
  extractKeywords, 
  analyzeStructuralSignals,
  COMPLEXITY_SIGNALS,
  STRUCTURAL_WEIGHTS 
} from './signals.js';

// Scoring utilities  
export { 
  scoreComplexity,
  calculateKeywordScores,
  applyStructuralAdjustments,
  normalizeScores,
  resolveTier,
  generateReason
} from './scoring.js';

/**
 * Version info
 */
export const CLASSIFIER_VERSION = '0.1.0';

/**
 * Default thresholds for different operations
 */
export const DEFAULT_THRESHOLDS = {
  /** Minimum confidence to trust classification */
  minConfidence: 0.4,
  
  /** Confidence threshold for routing decisions */
  routingConfidence: 0.6,
  
  /** Message length thresholds for quick classification */
  quickTiers: {
    simple: { maxLength: 100 },
    mid: { maxLength: 1000 },
    complex: { maxLength: 3000 },
    reasoning: { minLength: 2000 }
  }
} as const;