/**
 * Fast, comprehensive complexity classifier
 * Uses multiple signals: keywords, patterns, length, structure
 */

export interface FastClassificationResult {
  tier: 'simple' | 'mid' | 'complex' | 'reasoning';
  confidence: number;
  signals: string[];
}

/**
 * Classify prompt complexity using multi-signal analysis
 */
export function classifyPromptFast(text: string): FastClassificationResult {
  // Handle empty text
  if (!text || text.trim().length === 0) {
    return {
      tier: 'mid',
      confidence: 0.3,
      signals: ['empty-text', 'default-mid'],
    };
  }

  const length = text.length;
  const signals: string[] = [];

  // Tier scores (accumulated from various signals)
  const scores = {
    simple: 0,
    mid: 0,
    complex: 0,
    reasoning: 0,
  };

  // ===== SIMPLE TIER SIGNALS =====

  // 1. Greetings (very high weight)
  const greetingPatterns = [
    /\b(hi|hey|hello|good morning|good afternoon|good evening)\b/i,
    /\b(yes|no|ok|okay|thanks|thank you|bye)\b/i,
  ];

  for (const pattern of greetingPatterns) {
    if (pattern.test(text)) {
      scores.simple += 10;
      signals.push('greeting');
      break;
    }
  }

  // 2. Very short questions (< 50 chars)
  if (length < 50) {
    const simpleQuestions = [
      /what (time|date|day)/i,
      /how (much|many|old)/i,
      /where (is|are)/i,
      /when (is|was|will)/i,
      /who (is|are|was)/i,
    ];

    for (const pattern of simpleQuestions) {
      if (pattern.test(text)) {
        scores.simple += 8;
        signals.push('simple-question');
        break;
      }
    }
  }

  // 3. Very short length bonus
  if (length < 30) {
    scores.simple += 5;
    signals.push('very-short');
  } else if (length < 100) {
    scores.simple += 2;
    signals.push('short');
  }

  // ===== MID TIER SIGNALS =====

  // 1. Explanation/description requests
  const midKeywords = [
    /\b(explain|describe|tell me about|what is|how does)\b/i,
    /\b(summarize|overview|outline|compare)\b/i,
    /\b(difference between|similar to|versus)\b/i,
  ];

  for (const pattern of midKeywords) {
    if (pattern.test(text)) {
      scores.mid += 6;
      signals.push('explanation-request');
      break;
    }
  }

  // 2. Medium length
  if (length >= 100 && length < 500) {
    scores.mid += 3;
    signals.push('medium-length');
  }

  // ===== COMPLEX TIER SIGNALS =====

  // 1. Implementation/building tasks
  const complexKeywords = [
    /\b(implement|build|create|develop|code)\b/i,
    /\b(debug|fix|troubleshoot|resolve|solve)\b/i,
    /\b(refactor|migrate|optimize|improve)\b/i,
    /\b(integrate|setup|configure|install)\b/i,
  ];

  for (const pattern of complexKeywords) {
    if (pattern.test(text)) {
      scores.complex += 7;
      signals.push('implementation-task');
      break;
    }
  }

  // 2. Code indicators
  if (/```|function |class |const |import |def |async /.test(text)) {
    scores.complex += 4;
    signals.push('code-present');
  }

  // 3. Multi-step indicators
  if (/\b(step|then|after|next|finally)\b/i.test(text) && length > 200) {
    scores.complex += 3;
    signals.push('multi-step');
  }

  // 4. Long length
  if (length >= 500 && length < 1500) {
    scores.complex += 3;
    signals.push('long-length');
  }

  // ===== REASONING TIER SIGNALS =====

  // 1. Design/architecture tasks
  const reasoningKeywords = [
    /\b(design|architect|architecture|pattern|structure)\b/i,
    /\b(strategy|approach|methodology|framework)\b/i,
    /\b(prove|theorem|proof|demonstrate|justify)\b/i,
    /\b(analyze|analysis|evaluate|assess|compare)\b/i,
    /\b(distributed|scalable|performance|consistency|reliability)\b/i,
    /\b(tradeoff|trade-off|pros and cons|advantages)\b/i,
  ];

  for (const pattern of reasoningKeywords) {
    if (pattern.test(text)) {
      scores.reasoning += 8;
      signals.push('reasoning-task');
      break;
    }
  }

  // 2. Deep technical terms (multiple)
  const deepTechTerms = [
    /\b(cache|consensus|replication|sharding|partitioning)\b/i,
    /\b(concurrent|parallel|async|synchronization)\b/i,
    /\b(algorithm|complexity|optimization|heuristic)\b/i,
    /\b(protocol|encryption|authentication|authorization)\b/i,
  ];

  let techTermCount = 0;
  for (const pattern of deepTechTerms) {
    if (pattern.test(text)) {
      techTermCount++;
    }
  }

  if (techTermCount >= 2) {
    scores.reasoning += 6;
    signals.push('deep-technical');
  }

  // 3. Very long length
  if (length >= 1500) {
    scores.reasoning += 5;
    signals.push('very-long');
  }

  // ===== DETERMINE WINNER =====

  // Find tier with highest score
  const entries = Object.entries(scores) as Array<
    ['simple' | 'mid' | 'complex' | 'reasoning', number]
  >;
  entries.sort((a, b) => b[1] - a[1]);

  const [winningTier, winningScore] = entries[0];
  const [, runnerUpScore] = entries[1];

  // Calculate confidence based on score separation
  let confidence = 0.5; // default

  if (winningScore === 0) {
    // No signals matched - default to mid with low confidence
    return {
      tier: 'mid',
      confidence: 0.3,
      signals: ['no-signals', 'default-mid'],
    };
  }

  // High confidence if winner is significantly ahead
  const scoreDiff = winningScore - runnerUpScore;
  if (scoreDiff >= 5) {
    confidence = 0.95;
  } else if (scoreDiff >= 3) {
    confidence = 0.85;
  } else if (scoreDiff >= 2) {
    confidence = 0.75;
  } else {
    confidence = 0.6;
  }

  signals.push(`score:${winningTier}=${winningScore}`);

  return {
    tier: winningTier,
    confidence,
    signals,
  };
}
