/**
 * SlimClaw Model Routing - Test Dataset
 * 
 * Contains examples for each complexity tier to validate classification and routing
 * Each example has known expected tier and routing behavior for testing
 */

export interface RoutingTestCase {
  /** Unique identifier for the test case */
  id: string;
  /** The input prompt/message */
  prompt: string;
  /** Expected complexity tier classification */
  expectedTier: 'simple' | 'mid' | 'complex' | 'reasoning';
  /** Expected minimum confidence (0.0-1.0) */
  expectedMinConfidence: number;
  /** Description of why this should be classified as this tier */
  description: string;
  /** Keywords that should trigger classification */
  keywords?: string[];
  /** Expected signals that classifier should detect */
  expectedSignals?: string[];
}

/**
 * Test dataset with at least 3 examples per tier (12+ total)
 * These are carefully crafted to test different aspects of complexity classification
 */
export const ROUTING_TEST_DATASET: RoutingTestCase[] = [
  // SIMPLE TIER (3+ examples)
  {
    id: 'simple-1',
    prompt: 'What is 2+2?',
    expectedTier: 'simple',
    expectedMinConfidence: 0.7,
    description: 'Basic arithmetic question - should be classified as simple',
    keywords: ['arithmetic', 'basic'],
    expectedSignals: ['simple-math', 'short-query']
  },
  {
    id: 'simple-2', 
    prompt: 'Hello! How are you today?',
    expectedTier: 'simple',
    expectedMinConfidence: 0.6,
    description: 'Simple greeting and conversation starter',
    keywords: ['greeting', 'casual'],
    expectedSignals: ['greeting', 'short-query']
  },
  {
    id: 'simple-3',
    prompt: 'What is the capital of France?',
    expectedTier: 'simple',
    expectedMinConfidence: 0.7,
    description: 'Straightforward factual question requiring no reasoning',
    keywords: ['factual', 'geography'],
    expectedSignals: ['factual-question', 'short-query']
  },
  {
    id: 'simple-4',
    prompt: 'Convert 100 USD to EUR.',
    expectedTier: 'simple',
    expectedMinConfidence: 0.6,
    description: 'Simple conversion request with clear format',
    keywords: ['convert', 'currency'],
    expectedSignals: ['conversion-request', 'short-query']
  },

  // MID TIER (3+ examples) 
  {
    id: 'mid-1',
    prompt: 'Can you explain the differences between React hooks and class components? I\'m trying to understand when to use each approach in my web development project.',
    expectedTier: 'mid',
    expectedMinConfidence: 0.6,
    description: 'Technical explanation requiring moderate domain knowledge',
    keywords: ['explain', 'differences', 'technical'],
    expectedSignals: ['explanation-request', 'technical-domain', 'comparison']
  },
  {
    id: 'mid-2',
    prompt: 'I have a dataset with customer purchase history. What are some good approaches to segment customers for targeted marketing campaigns?',
    expectedTier: 'mid',
    expectedMinConfidence: 0.6,
    description: 'Business analysis requiring domain knowledge and practical recommendations',
    keywords: ['dataset', 'approaches', 'analysis'],
    expectedSignals: ['analysis-request', 'business-domain', 'recommendations']
  },
  {
    id: 'mid-3',
    prompt: 'Write a Python function that reads a CSV file and returns the top 10 most frequent values in a specified column.',
    expectedTier: 'mid',
    expectedMinConfidence: 0.7,
    description: 'Moderate programming task requiring specific implementation',
    keywords: ['write', 'function', 'programming'],
    expectedSignals: ['code-request', 'specific-implementation', 'file-processing']
  },
  {
    id: 'mid-4',
    prompt: 'Compare the pros and cons of microservices vs monolithic architecture for a medium-sized e-commerce application.',
    expectedTier: 'mid',
    expectedMinConfidence: 0.6,
    description: 'Technical architecture comparison requiring experience-based analysis',
    keywords: ['compare', 'architecture', 'technical'],
    expectedSignals: ['comparison', 'technical-domain', 'architecture-decision']
  },

  // COMPLEX TIER (3+ examples)
  {
    id: 'complex-1',
    prompt: 'I need to design a distributed system that can handle 1 million concurrent users with 99.9% uptime. The system needs to process real-time payments, maintain ACID compliance, and scale globally. Please provide a detailed architecture including specific technologies, load balancing strategies, database sharding approaches, monitoring setup, and disaster recovery plans.',
    expectedTier: 'complex',
    expectedMinConfidence: 0.7,
    description: 'Complex system design requiring deep technical knowledge and multi-faceted solution',
    keywords: ['distributed', 'architecture', 'scalability', 'detailed'],
    expectedSignals: ['system-design', 'multi-requirements', 'technical-depth', 'long-query']
  },
  {
    id: 'complex-2',
    prompt: 'Analyze the economic implications of implementing a Universal Basic Income policy in the United States. Consider the effects on labor markets, inflation, government spending, social welfare programs, and long-term economic growth. Include historical precedents, international comparisons, and potential implementation strategies with their trade-offs.',
    expectedTier: 'complex',
    expectedMinConfidence: 0.7,
    description: 'Multi-dimensional policy analysis requiring economic theory and empirical considerations',
    keywords: ['analyze', 'implications', 'policy', 'economic'],
    expectedSignals: ['policy-analysis', 'multi-factor', 'economic-theory', 'comparative-analysis']
  },
  {
    id: 'complex-3',
    prompt: 'Create a comprehensive machine learning pipeline for predicting customer churn that includes data preprocessing, feature engineering, model selection and tuning, ensemble methods, interpretability analysis, A/B testing framework, deployment strategy, and monitoring systems. The solution should handle imbalanced data, concept drift, and provide business-actionable insights.',
    expectedTier: 'complex',
    expectedMinConfidence: 0.8,
    description: 'End-to-end ML project requiring expertise across multiple domains',
    keywords: ['comprehensive', 'machine learning', 'pipeline', 'deployment'],
    expectedSignals: ['ml-project', 'end-to-end', 'multiple-components', 'production-ready']
  },
  {
    id: 'complex-4',
    prompt: 'Design a cybersecurity framework for a multinational financial institution that addresses threat modeling, zero-trust architecture, compliance with multiple regulatory frameworks (SOX, PCI-DSS, GDPR), incident response procedures, employee training programs, and third-party risk management. Include specific tool recommendations and implementation timeline.',
    expectedTier: 'complex',
    expectedMinConfidence: 0.7,
    description: 'Comprehensive security framework requiring regulatory and technical expertise',
    keywords: ['cybersecurity', 'framework', 'compliance', 'comprehensive'],
    expectedSignals: ['security-design', 'regulatory-compliance', 'risk-management', 'enterprise-scale']
  },

  // REASONING TIER (3+ examples)
  {
    id: 'reasoning-1',
    prompt: 'Three logicians walk into a bar. The bartender asks "Do all of you want a drink?" The first logician says "I don\'t know." The second logician says "I don\'t know." The third logician says "Yes." Explain the logical reasoning behind each response and why the third logician could definitively answer "Yes."',
    expectedTier: 'reasoning',
    expectedMinConfidence: 0.8,
    description: 'Logic puzzle requiring step-by-step deductive reasoning and perspective-taking',
    keywords: ['logic', 'reasoning', 'puzzle', 'explain'],
    expectedSignals: ['logic-puzzle', 'step-by-step', 'deductive-reasoning', 'perspective-analysis']
  },
  {
    id: 'reasoning-2',
    prompt: 'You have 12 balls that look identical. One ball is either heavier or lighter than the others (you don\'t know which). You have a balance scale and can use it exactly 3 times. How can you determine which ball is different and whether it\'s heavier or lighter? Provide the complete strategy with decision trees for all possible outcomes.',
    expectedTier: 'reasoning',
    expectedMinConfidence: 0.9,
    description: 'Complex optimization problem requiring systematic reasoning and exhaustive case analysis',
    keywords: ['strategy', 'optimization', 'decision tree', 'systematic'],
    expectedSignals: ['optimization-puzzle', 'decision-tree', 'systematic-analysis', 'constraint-satisfaction']
  },
  {
    id: 'reasoning-3',
    prompt: 'A company claims their new drug increases IQ by 10 points on average. Their study shows: Control group (n=100): mean IQ = 100, std = 15. Treatment group (n=100): mean IQ = 110, std = 15. p-value = 0.03. However, you notice the treatment group started with a baseline IQ of 105. Analyze what\'s wrong with this claim, explain the statistical issues, and describe what a proper study design should look like.',
    expectedTier: 'reasoning',
    expectedMinConfidence: 0.8,
    description: 'Statistical reasoning requiring identification of confounding variables and experimental design flaws',
    keywords: ['statistical', 'analysis', 'experimental', 'confounding'],
    expectedSignals: ['statistical-reasoning', 'experimental-design', 'confounding-analysis', 'critical-thinking']
  },
  {
    id: 'reasoning-4',
    prompt: 'In a game theory scenario, two countries must decide whether to cooperate or defect on a climate agreement. If both cooperate, each gets +3 points. If both defect, each gets -2 points. If one cooperates and one defects, the defector gets +5 and cooperator gets -4. This game repeats infinitely with a discount factor of 0.9. What strategies are Nash equilibria? Is cooperation sustainable? Analyze using backward induction and repeated game theory.',
    expectedTier: 'reasoning',
    expectedMinConfidence: 0.8,
    description: 'Game theory analysis requiring formal mathematical reasoning and strategic thinking',
    keywords: ['game theory', 'Nash equilibrium', 'strategy', 'mathematical'],
    expectedSignals: ['game-theory', 'mathematical-proof', 'strategic-analysis', 'infinite-horizon']
  }
];

/**
 * Edge cases for testing fallback behavior and error handling
 */
export const EDGE_CASE_DATASET: RoutingTestCase[] = [
  {
    id: 'edge-1',
    prompt: '',
    expectedTier: 'simple',
    expectedMinConfidence: 0.5,
    description: 'Empty prompt should default to simple tier',
    expectedSignals: ['empty-input']
  },
  {
    id: 'edge-2',
    prompt: 'a'.repeat(10000),
    expectedTier: 'mid',
    expectedMinConfidence: 0.4,
    description: 'Very long repetitive text should be handled gracefully',
    expectedSignals: ['long-input', 'repetitive']
  },
  {
    id: 'edge-3',
    prompt: '🚀🎯💡🔥⭐🌟💻🎨🎪🎭',
    expectedTier: 'simple',
    expectedMinConfidence: 0.3,
    description: 'Emoji-only prompt should be classified as simple',
    expectedSignals: ['emoji-only', 'non-textual']
  },
  {
    id: 'edge-4',
    prompt: 'SELECT * FROM users WHERE id = 1; DROP TABLE users; --',
    expectedTier: 'simple',
    expectedMinConfidence: 0.6,
    description: 'SQL injection attempt should be handled as simple query',
    keywords: ['sql', 'database'],
    expectedSignals: ['sql-code', 'potential-injection']
  }
];

/**
 * Get all test cases combined
 */
export function getAllTestCases(): RoutingTestCase[] {
  return [...ROUTING_TEST_DATASET, ...EDGE_CASE_DATASET];
}

/**
 * Get test cases by tier
 */
export function getTestCasesByTier(tier: 'simple' | 'mid' | 'complex' | 'reasoning'): RoutingTestCase[] {
  return ROUTING_TEST_DATASET.filter(testCase => testCase.expectedTier === tier);
}

/**
 * Validate dataset meets minimum requirements
 */
export function validateDataset(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  // Check minimum 3 examples per tier
  const tiers = ['simple', 'mid', 'complex', 'reasoning'] as const;
  tiers.forEach(tier => {
    const count = getTestCasesByTier(tier).length;
    if (count < 3) {
      errors.push(`Tier '${tier}' has only ${count} examples, minimum 3 required`);
    }
  });
  
  // Check total count
  const totalCount = ROUTING_TEST_DATASET.length;
  if (totalCount < 12) {
    errors.push(`Dataset has only ${totalCount} examples, minimum 12 required`);
  }
  
  // Check unique IDs
  const ids = ROUTING_TEST_DATASET.map(tc => tc.id);
  const uniqueIds = new Set(ids);
  if (ids.length !== uniqueIds.size) {
    errors.push('Dataset contains duplicate IDs');
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}