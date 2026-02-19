/**
 * COMPLEXITY_SIGNALS - Keyword maps for complexity classification
 * 
 * Based on SlimClaw design doc classification tiers:
 * - simple: greetings, yes/no, short questions
 * - mid: explanations, summaries, moderate code 
 * - complex: architecture, debugging, multi-step
 * - reasoning: math proofs, strategic analysis, ethical dilemmas
 */

export type ComplexityTier = "simple" | "mid" | "complex" | "reasoning";

export interface ComplexitySignal {
  keywords: string[];
  weight: number; // multiplier for scoring
  description: string;
}

export const COMPLEXITY_SIGNALS: Record<ComplexityTier, ComplexitySignal[]> = {
  simple: [
    {
      keywords: ["hello", "hi", "hey", "good morning", "good afternoon", "good evening"],
      weight: 1.0,
      description: "Greetings"
    },
    {
      keywords: ["yes", "no", "ok", "okay", "thanks", "thank you", "please", "sure"],
      weight: 0.8,
      description: "Simple responses"
    },
    {
      keywords: ["what", "when", "where", "who", "which", "how much", "how many"],
      weight: 0.6,
      description: "Simple questions"
    },
    {
      keywords: ["quick", "brief", "short", "simple", "just"],
      weight: 0.5,
      description: "Brevity indicators"
    }
  ],

  mid: [
    {
      keywords: ["explain", "describe", "tell me about", "what is", "how does"],
      weight: 1.5,
      description: "Explanation requests"
    },
    {
      keywords: ["summarize", "summary", "overview", "outline", "list"],
      weight: 0.9,
      description: "Summarization tasks"
    },
    {
      keywords: ["function", "method", "class", "variable", "import", "export"],
      weight: 0.8,
      description: "Basic code concepts"
    },
    {
      keywords: ["tutorial", "guide", "example", "documentation", "help with"],
      weight: 0.7,
      description: "Learning/guidance requests"
    },
    {
      keywords: ["compare", "difference", "similar", "versus", "vs"],
      weight: 0.6,
      description: "Comparisons"
    }
  ],

  complex: [
    {
      keywords: ["architecture", "design", "pattern", "structure", "framework"],
      weight: 1.2,
      description: "Architecture/design"
    },
    {
      keywords: ["debug", "debugging", "error", "issue", "problem", "fix", "troubleshoot"],
      weight: 1.1,
      description: "Debugging tasks"
    },
    {
      keywords: ["optimize", "performance", "scalability", "efficiency", "bottleneck"],
      weight: 1.0,
      description: "Optimization"
    },
    {
      keywords: ["implement", "build", "create", "develop", "integrate"],
      weight: 0.9,
      description: "Implementation tasks"
    },
    {
      keywords: ["refactor", "migrate", "upgrade", "modernize", "rewrite"],
      weight: 0.8,
      description: "Refactoring tasks"
    },
    {
      keywords: ["multi-step", "workflow", "pipeline", "process", "sequence"],
      weight: 0.7,
      description: "Multi-step processes"
    },
    {
      keywords: ["security", "authentication", "authorization", "encryption", "vulnerability"],
      weight: 0.9,
      description: "Security concerns"
    }
  ],

  reasoning: [
    {
      keywords: ["prove", "proof", "theorem", "mathematical", "equation", "formula"],
      weight: 1.5,
      description: "Mathematical proofs"
    },
    {
      keywords: ["strategy", "strategic", "planning", "approach", "methodology"],
      weight: 1.3,
      description: "Strategic analysis"
    },
    {
      keywords: ["ethical", "moral", "dilemma", "philosophy", "principle", "should we"],
      weight: 1.4,
      description: "Ethical dilemmas"
    },
    {
      keywords: ["analyze", "analysis", "evaluate", "assessment", "critique"],
      weight: 1.2,
      description: "Deep analysis"
    },
    {
      keywords: ["hypothesis", "theory", "research", "study", "investigation"],
      weight: 1.1,
      description: "Research/investigation"
    },
    {
      keywords: ["paradox", "contradiction", "logic", "logical", "reasoning"],
      weight: 1.0,
      description: "Logical reasoning"
    },
    {
      keywords: ["implications", "consequences", "trade-offs", "pros and cons"],
      weight: 0.9,
      description: "Consequence analysis"
    }
  ]
};

/**
 * Additional signals based on message characteristics
 */
export interface StructuralSignals {
  hasCodeBlocks: boolean;
  hasToolCalls: boolean;
  messageLength: number;
  questionCount: number;
  complexityIndicators: string[];
}

/**
 * Scoring weights for structural signals
 */
export const STRUCTURAL_WEIGHTS = {
  codeBlock: {
    simple: -0.3,    // code blocks reduce simple likelihood
    mid: 0.4,        // moderate boost for mid
    complex: 0.6,    // strong boost for complex
    reasoning: 0.2   // slight boost for reasoning
  },
  toolCalls: {
    simple: -0.8,    // tool use indicates complexity
    mid: 0.6,
    complex: 1.0,
    reasoning: 0.5
  },
  messageLength: {
    // Scoring based on character count thresholds
    thresholds: {
      veryShort: 50,   // likely simple
      short: 200,      // could be simple/mid
      medium: 1000,    // likely mid/complex
      long: 3000       // likely complex/reasoning
    },
    weights: {
      veryShort: { simple: 0.8, mid: -0.2, complex: -0.5, reasoning: -0.7 },
      short: { simple: 0.4, mid: 0.2, complex: -0.2, reasoning: -0.4 },
      medium: { simple: -0.2, mid: 0.3, complex: 0.4, reasoning: 0.1 },
      long: { simple: -0.5, mid: -0.1, complex: 0.5, reasoning: 0.8 },
      veryLong: { simple: -0.8, mid: -0.3, complex: 0.3, reasoning: 0.9 }
    }
  },
  questionCount: {
    // Multiple questions often indicate complexity
    single: { simple: 0.3, mid: 0.1, complex: -0.1, reasoning: -0.2 },
    multiple: { simple: -0.2, mid: 0.2, complex: 0.4, reasoning: 0.3 }
  }
};

/**
 * Extract keywords from text (case-insensitive)
 */
export function extractKeywords(text: string): string[] {
  const lowerText = text.toLowerCase();
  const extractedKeywords: string[] = [];

  // Check all signal keywords
  for (const tier of Object.keys(COMPLEXITY_SIGNALS) as ComplexityTier[]) {
    for (const signal of COMPLEXITY_SIGNALS[tier]) {
      for (const keyword of signal.keywords) {
        if (lowerText.includes(keyword.toLowerCase())) {
          extractedKeywords.push(keyword);
        }
      }
    }
  }

  return [...new Set(extractedKeywords)]; // deduplicate
}

/**
 * Analyze structural characteristics of messages
 */
export function analyzeStructuralSignals(messages: any[]): StructuralSignals {
  const lastMessage = messages[messages.length - 1];
  const content = typeof lastMessage?.content === 'string' 
    ? lastMessage.content 
    : Array.isArray(lastMessage?.content)
      ? lastMessage.content.map((c: any) => c.text || c.content || '').join(' ')
      : '';

  // Detect code blocks (markdown style)
  const hasCodeBlocks = /```[\s\S]*?```|`[^`\n]+`/.test(content);
  
  // Detect tool calls/use
  const hasToolCalls = Boolean(
    lastMessage?.tool_calls?.length || 
    lastMessage?.tool_use?.length ||
    messages.some(m => m.role === 'tool')
  );

  // Count questions
  const questionCount = (content.match(/\?/g) || []).length;

  // Extract complexity indicators
  const complexityIndicators = extractKeywords(content);

  return {
    hasCodeBlocks,
    hasToolCalls,
    messageLength: content.length,
    questionCount,
    complexityIndicators
  };
}