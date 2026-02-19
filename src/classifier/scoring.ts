/**
 * Scoring system for complexity classification
 * Aggregates signals and resolves final tier with confidence
 */

import { 
  COMPLEXITY_SIGNALS, 
  STRUCTURAL_WEIGHTS, 
  type ComplexityTier, 
  type StructuralSignals 
} from './signals.js';

export interface TierScores {
  simple: number;
  mid: number;
  complex: number;
  reasoning: number;
}

export interface ScoringResult {
  scores: TierScores;
  tier: ComplexityTier;
  confidence: number;
  reason: string;
  signals: string[];
}

/**
 * Calculate raw keyword-based scores for each tier
 */
export function calculateKeywordScores(keywords: string[]): TierScores {
  const scores: TierScores = {
    simple: 0,
    mid: 0,
    complex: 0,
    reasoning: 0
  };

  const keywordLower = keywords.map(k => k.toLowerCase());

  // Score each tier based on matching keywords
  for (const tier of Object.keys(COMPLEXITY_SIGNALS) as ComplexityTier[]) {
    for (const signal of COMPLEXITY_SIGNALS[tier]) {
      for (const keyword of signal.keywords) {
        if (keywordLower.includes(keyword.toLowerCase())) {
          scores[tier] += signal.weight;
        }
      }
    }
  }

  return scores;
}

/**
 * Apply structural signal adjustments to scores
 */
export function applyStructuralAdjustments(
  baseScores: TierScores, 
  structuralSignals: StructuralSignals
): TierScores {
  const adjustedScores = { ...baseScores };

  // Code block adjustments
  if (structuralSignals.hasCodeBlocks) {
    for (const tier of Object.keys(STRUCTURAL_WEIGHTS.codeBlock) as ComplexityTier[]) {
      adjustedScores[tier] += STRUCTURAL_WEIGHTS.codeBlock[tier];
    }
  }

  // Tool calls adjustments
  if (structuralSignals.hasToolCalls) {
    for (const tier of Object.keys(STRUCTURAL_WEIGHTS.toolCalls) as ComplexityTier[]) {
      adjustedScores[tier] += STRUCTURAL_WEIGHTS.toolCalls[tier];
    }
  }

  // Message length adjustments
  const lengthCategory = categorizeLengthCategory(structuralSignals.messageLength);
  const lengthWeights = STRUCTURAL_WEIGHTS.messageLength.weights[lengthCategory];
  
  for (const tier of Object.keys(lengthWeights) as ComplexityTier[]) {
    adjustedScores[tier] += lengthWeights[tier];
  }

  // Question count adjustments
  const questionCategory = structuralSignals.questionCount > 1 ? 'multiple' : 'single';
  const questionWeights = STRUCTURAL_WEIGHTS.questionCount[questionCategory];
  
  for (const tier of Object.keys(questionWeights) as ComplexityTier[]) {
    adjustedScores[tier] += questionWeights[tier];
  }

  return adjustedScores;
}

/**
 * Categorize message length for scoring
 */
function categorizeLengthCategory(length: number): keyof typeof STRUCTURAL_WEIGHTS.messageLength.weights {
  const thresholds = STRUCTURAL_WEIGHTS.messageLength.thresholds;
  
  if (length <= thresholds.veryShort) return 'veryShort';
  if (length <= thresholds.short) return 'short';
  if (length <= thresholds.medium) return 'medium';
  if (length <= thresholds.long) return 'long';
  return 'veryLong';
}

/**
 * Normalize scores to 0-1 range using softmax-like function
 */
export function normalizeScores(scores: TierScores): TierScores {
  // Add small constant to avoid division by zero and handle negative scores
  const adjustedScores = {
    simple: Math.max(0.01, scores.simple + 1.0),
    mid: Math.max(0.01, scores.mid + 1.0),
    complex: Math.max(0.01, scores.complex + 1.0),
    reasoning: Math.max(0.01, scores.reasoning + 1.0)
  };

  const sum = adjustedScores.simple + adjustedScores.mid + adjustedScores.complex + adjustedScores.reasoning;

  return {
    simple: adjustedScores.simple / sum,
    mid: adjustedScores.mid / sum,
    complex: adjustedScores.complex / sum,
    reasoning: adjustedScores.reasoning / sum
  };
}

/**
 * Resolve final tier from normalized scores
 */
export function resolveTier(normalizedScores: TierScores): { tier: ComplexityTier; confidence: number } {
  const tiers = Object.keys(normalizedScores) as ComplexityTier[];
  
  // Find tier with highest score
  let bestTier: ComplexityTier = 'complex'; // default fallback
  let maxScore = 0;
  
  for (const tier of tiers) {
    if (normalizedScores[tier] > maxScore) {
      maxScore = normalizedScores[tier];
      bestTier = tier;
    }
  }

  // Calculate confidence based on score margin
  const sortedScores = tiers
    .map(tier => ({ tier, score: normalizedScores[tier] }))
    .sort((a, b) => b.score - a.score);

  const firstScore = sortedScores[0].score;
  const secondScore = sortedScores[1]?.score || 0;
  
  // Confidence is the margin between first and second place
  // Scale from 0.5 (tie) to 1.0 (complete dominance)
  const margin = firstScore - secondScore;
  const confidence = Math.min(1.0, 0.5 + margin);

  return {
    tier: bestTier,
    confidence: Math.round(confidence * 100) / 100 // round to 2 decimal places
  };
}

/**
 * Generate human-readable explanation for the classification
 */
export function generateReason(
  tier: ComplexityTier,
  confidence: number,
  structuralSignals: StructuralSignals,
  keywordMatches: string[]
): string {
  const reasons: string[] = [];

  // Primary tier reasoning
  switch (tier) {
    case 'simple':
      if (structuralSignals.messageLength <= 100) {
        reasons.push('very short message');
      }
      if (keywordMatches.some(k => ['hello', 'hi', 'yes', 'no', 'ok', 'thanks'].includes(k.toLowerCase()))) {
        reasons.push('contains greeting/simple response');
      }
      break;
      
    case 'mid':
      if (keywordMatches.some(k => ['explain', 'describe', 'what is', 'how does'].includes(k.toLowerCase()))) {
        reasons.push('requests explanation');
      }
      if (structuralSignals.hasCodeBlocks) {
        reasons.push('contains code blocks');
      }
      break;
      
    case 'complex':
      if (keywordMatches.some(k => ['debug', 'architecture', 'optimize', 'implement'].includes(k.toLowerCase()))) {
        reasons.push('involves complex technical task');
      }
      if (structuralSignals.hasToolCalls) {
        reasons.push('requires tool usage');
      }
      if (structuralSignals.messageLength > 1000) {
        reasons.push('lengthy detailed request');
      }
      break;
      
    case 'reasoning':
      if (keywordMatches.some(k => ['prove', 'strategy', 'ethical', 'analyze'].includes(k.toLowerCase()))) {
        reasons.push('requires deep reasoning/analysis');
      }
      if (structuralSignals.messageLength > 2000) {
        reasons.push('very detailed complex request');
      }
      break;
  }

  // Confidence modifier
  const confidenceDesc = confidence > 0.8 ? 'high confidence' 
                       : confidence > 0.6 ? 'medium confidence'
                       : 'low confidence';

  const baseReason = reasons.length > 0 
    ? reasons.join(', ') 
    : `classified as ${tier} based on content analysis`;

  return `${tier} tier (${confidenceDesc}): ${baseReason}`;
}

/**
 * Main scoring function that aggregates all signals
 */
export function scoreComplexity(
  keywords: string[],
  structuralSignals: StructuralSignals
): ScoringResult {
  // Step 1: Calculate base keyword scores
  const keywordScores = calculateKeywordScores(keywords);

  // Step 2: Apply structural adjustments  
  const adjustedScores = applyStructuralAdjustments(keywordScores, structuralSignals);

  // Step 3: Normalize to probabilities
  const normalizedScores = normalizeScores(adjustedScores);

  // Step 4: Resolve final tier and confidence
  const { tier, confidence } = resolveTier(normalizedScores);

  // Step 5: Generate human-readable reason
  const reason = generateReason(tier, confidence, structuralSignals, keywords);

  // Step 6: Collect fired signals
  const signals = collectFiredSignals(keywords, structuralSignals);

  return {
    scores: normalizedScores,
    tier,
    confidence,
    reason,
    signals
  };
}

/**
 * Collect list of signals that contributed to the classification
 */
function collectFiredSignals(keywords: string[], structuralSignals: StructuralSignals): string[] {
  const firedSignals: string[] = [];

  // Add keyword-based signals
  for (const keyword of keywords) {
    firedSignals.push(`keyword:${keyword}`);
  }

  // Add structural signals
  if (structuralSignals.hasCodeBlocks) {
    firedSignals.push('structural:code-blocks');
  }
  
  if (structuralSignals.hasToolCalls) {
    firedSignals.push('structural:tool-calls');
  }
  
  if (structuralSignals.messageLength > 2000) {
    firedSignals.push('structural:very-long-message');
  } else if (structuralSignals.messageLength > 1000) {
    firedSignals.push('structural:long-message');
  } else if (structuralSignals.messageLength < 100) {
    firedSignals.push('structural:short-message');
  }
  
  if (structuralSignals.questionCount > 1) {
    firedSignals.push('structural:multiple-questions');
  }

  return firedSignals;
}