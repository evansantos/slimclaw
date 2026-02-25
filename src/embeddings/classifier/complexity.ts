import type { ComplexityTier, ClassifierConfig } from '../config/types.js';

/**
 * Default character count thresholds for complexity classification
 */
const DEFAULT_THRESHOLDS = {
  SIMPLE_MAX: 200, // Up to 200 chars = simple
  MID_MAX: 1000, // 201-1000 chars = mid
  // > 1000 chars = complex
};

/**
 * Configurable complexity classifier
 */
export class ComplexityClassifier {
  private simpleMax: number;
  private midMax: number;

  constructor(config?: ClassifierConfig) {
    this.simpleMax = config?.simpleMaxChars ?? DEFAULT_THRESHOLDS.SIMPLE_MAX;
    this.midMax = config?.midMaxChars ?? DEFAULT_THRESHOLDS.MID_MAX;
  }

  /**
   * Classify text complexity based on length
   *
   * @param text - Input text to classify
   * @returns Complexity tier (simple, mid, or complex)
   *
   * @example
   * ```ts
   * const classifier = new ComplexityClassifier();
   * classifier.classify('Hello') // 'simple'
   * classifier.classify('A longer text...') // 'mid'
   * classifier.classify('Very long technical document...') // 'complex'
   * ```
   */
  classify(text: string): ComplexityTier {
    const trimmed = text.trim();
    const length = trimmed.length;

    if (length <= this.simpleMax) {
      return 'simple';
    }

    if (length <= this.midMax) {
      return 'mid';
    }

    return 'complex';
  }
}

/**
 * Default classifier instance for backward compatibility
 */
const defaultClassifier = new ComplexityClassifier();

/**
 * Classify text complexity based on length (backward compatible function)
 *
 * @param text - Input text to classify
 * @returns Complexity tier (simple, mid, or complex)
 *
 * @example
 * ```ts
 * classifyComplexity('Hello') // 'simple'
 * classifyComplexity('A longer text...') // 'mid'
 * classifyComplexity('Very long technical document...') // 'complex'
 * ```
 */
export function classifyComplexity(text: string): ComplexityTier {
  return defaultClassifier.classify(text);
}
