/**
 * Conversation summarization utilities
 * Heuristic extraction of key points from message history
 */

import type { Message } from './token-counter.js';

export interface SummaryResult {
  summary: string;
  method: "heuristic" | "llm";
  keyPointsCount: number;
  tokensSaved: number;
}

/**
 * Extract key points from messages using heuristic approach
 * Fast, deterministic, no API calls needed
 */
export function extractKeyPoints(messages: Message[]): string | null {
  if (messages.length === 0) return null;

  const keyPoints: string[] = [];
  const seenPoints = new Set<string>();

  for (const message of messages) {
    const content = extractContentText(message.content);
    if (!content) continue;

    // Extract key points based on message role and patterns
    const points = extractPointsFromContent(content, message.role);
    
    for (const point of points) {
      // Deduplicate similar points
      const normalizedPoint = normalizeKeyPoint(point);
      if (!seenPoints.has(normalizedPoint) && point.length >= 20) {
        keyPoints.push(point);
        seenPoints.add(normalizedPoint);
      }
    }
  }

  if (keyPoints.length === 0) return null;

  // Limit to most important points (last 5 for recency)
  const selectedPoints = keyPoints
    .slice(-8) // Keep last 8 points
    .filter(point => isSignificantPoint(point))
    .slice(-5); // Then take top 5

  return selectedPoints.length > 0 
    ? `Previous context: ${selectedPoints.join('; ')}.`
    : null;
}

/**
 * Extract meaningful points from content based on role and patterns
 */
function extractPointsFromContent(content: string, role: string): string[] {
  const points: string[] = [];

  if (role === 'assistant') {
    // Extract conclusions, decisions, and key statements from assistant
    points.push(...extractAssistantKeyPoints(content));
  } else if (role === 'user') {
    // Extract requests, goals, and important context from user
    points.push(...extractUserKeyPoints(content));
  }

  return points;
}

/**
 * Extract key points from assistant messages
 */
function extractAssistantKeyPoints(content: string): string[] {
  const points: string[] = [];

  // Split into sentences
  const sentences = content
    .split(/[.!?]+/)
    .map(s => s.trim())
    .filter(s => s.length > 20);

  for (const sentence of sentences) {
    const lower = sentence.toLowerCase();

    // Skip common filler phrases
    if (isFillerPhrase(lower)) continue;

    // Priority patterns - important conclusions/actions
    if (isPriorityPattern(lower)) {
      points.push(sentence.slice(0, 120));
    }
    // Factual statements
    else if (isFactualStatement(lower)) {
      points.push(sentence.slice(0, 100));
    }
    // Technical details
    else if (isTechnicalDetail(lower)) {
      points.push(sentence.slice(0, 100));
    }
  }

  return points;
}

/**
 * Extract key points from user messages
 */
function extractUserKeyPoints(content: string): string[] {
  const points: string[] = [];

  // Look for clear requests or goals
  const sentences = content
    .split(/[.!?\n]+/)
    .map(s => s.trim())
    .filter(s => s.length > 15);

  for (const sentence of sentences) {
    const lower = sentence.toLowerCase();

    // User requests and goals
    if (isUserRequest(lower)) {
      points.push(sentence.slice(0, 100));
    }
    // Context or constraints provided by user
    else if (isUserContext(lower)) {
      points.push(sentence.slice(0, 100));
    }
  }

  return points;
}

/**
 * Check if content is a filler phrase to skip
 */
function isFillerPhrase(content: string): boolean {
  const fillers = [
    'let me',
    'i can help',
    'i\'ll help',
    'here\'s',
    'i understand',
    'of course',
    'certainly',
    'i\'d be happy',
    'let\'s',
  ];
  
  return fillers.some(filler => content.startsWith(filler));
}

/**
 * Check if sentence contains priority patterns
 */
function isPriorityPattern(content: string): boolean {
  const patterns = [
    // Decisions and conclusions
    'the solution is',
    'i recommend',
    'the best approach',
    'you should',
    'the issue is',
    'the problem is',
    // Actions taken
    'i created',
    'i implemented',
    'i fixed',
    'i updated',
    'i added',
    // Important findings
    'the key insight',
    'importantly',
    'critical',
    'essential',
    'the main',
  ];
  
  return patterns.some(pattern => content.includes(pattern));
}

/**
 * Check if sentence is a factual statement
 */
function isFactualStatement(content: string): boolean {
  const patterns = [
    'this means',
    'which means',
    'because',
    'due to',
    'results in',
    'causes',
    'leads to',
  ];
  
  return patterns.some(pattern => content.includes(pattern));
}

/**
 * Check if sentence contains technical details
 */
function isTechnicalDetail(content: string): boolean {
  const techPatterns = [
    'function',
    'variable',
    'class',
    'method',
    'api',
    'endpoint',
    'database',
    'error',
    'exception',
    'configuration',
    'parameter',
  ];
  
  return techPatterns.some(pattern => content.includes(pattern));
}

/**
 * Check if sentence is a user request
 */
function isUserRequest(content: string): boolean {
  const patterns = [
    'can you',
    'could you',
    'please',
    'i need',
    'i want',
    'help me',
    'how do i',
    'how can i',
    'what is',
    'explain',
  ];
  
  return patterns.some(pattern => content.includes(pattern));
}

/**
 * Check if sentence provides user context
 */
function isUserContext(content: string): boolean {
  const patterns = [
    'i have',
    'i\'m using',
    'my setup',
    'my system',
    'currently',
    'right now',
    'the requirement',
    'the constraint',
  ];
  
  return patterns.some(pattern => content.includes(pattern));
}

/**
 * Check if a point is significant enough to keep
 */
function isSignificantPoint(point: string): boolean {
  const lower = point.toLowerCase();
  
  // Skip very generic points
  const genericPatterns = [
    'let me know',
    'if you need',
    'feel free',
    'hope this helps',
    'good luck',
  ];
  
  return !genericPatterns.some(pattern => lower.includes(pattern));
}

/**
 * Normalize key point for deduplication
 */
function normalizeKeyPoint(point: string): string {
  return point
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 50);
}

/**
 * Extract text content from message content (string or ContentBlock[])
 */
function extractContentText(content: string | any[]): string {
  if (typeof content === 'string') {
    return content;
  }
  
  if (Array.isArray(content)) {
    return content
      .map(block => block.text || '')
      .filter(text => text.length > 0)
      .join(' ');
  }
  
  return '';
}

/**
 * Generate summary with metadata for metrics
 */
export function generateSummary(messages: Message[]): SummaryResult {
  const originalLength = messages.reduce((sum, m) => 
    sum + extractContentText(m.content).length, 0
  );
  
  const summary = extractKeyPoints(messages);
  const summaryLength = summary?.length || 0;
  
  // Count extracted key points
  const keyPointsCount = summary 
    ? summary.split(';').length 
    : 0;
  
  return {
    summary: summary || '',
    method: 'heuristic',
    keyPointsCount,
    tokensSaved: Math.max(0, Math.ceil((originalLength - summaryLength) / 4)),
  };
}