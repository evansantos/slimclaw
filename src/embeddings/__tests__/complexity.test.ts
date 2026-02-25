import { describe, it, expect } from 'vitest';
import { classifyComplexity, ComplexityClassifier } from '../classifier/complexity.js';

describe('classifyComplexity (function)', () => {
  it('should classify short text as simple', () => {
    const text = 'Hello world';
    expect(classifyComplexity(text)).toBe('simple');
  });

  it('should classify medium text as mid', () => {
    const text =
      'This is a medium length text that contains multiple sentences. It should be classified as mid-tier complexity because it is longer than simple but not yet complex. We need to add more content to ensure this text exceeds the 200 character threshold for simple classification and falls into the mid-tier range. This additional text helps demonstrate the classification logic working correctly for medium-length content that requires more sophisticated embedding models.';
    expect(classifyComplexity(text)).toBe('mid');
  });

  it('should classify long text as complex', () => {
    const text = `
      This is a very long technical document that discusses advanced concepts in machine learning and embeddings.
      When working with vector embeddings, we need to consider dimensionality reduction techniques such as PCA and t-SNE.
      The semantic similarity between embeddings can be measured using cosine similarity or Euclidean distance.
      Large language models generate embeddings by processing text through multiple transformer layers.
      Each layer captures different levels of semantic and syntactic information.
      The final embedding vector represents a dense, continuous representation of the input text in a high-dimensional space.
      This allows for efficient semantic search and clustering operations.
      Furthermore, modern embedding models can handle multiple languages and technical domains.
    `.repeat(3);
    expect(classifyComplexity(text)).toBe('complex');
  });

  it('should handle empty text as simple', () => {
    expect(classifyComplexity('')).toBe('simple');
  });

  it('should handle whitespace-only text as simple', () => {
    expect(classifyComplexity('   \n\t  ')).toBe('simple');
  });

  it('should classify based on character count, not word count', () => {
    // 100 chars
    const simple = 'a'.repeat(100);
    expect(classifyComplexity(simple)).toBe('simple');

    // 500 chars
    const mid = 'a'.repeat(500);
    expect(classifyComplexity(mid)).toBe('mid');

    // 2000 chars
    const complex = 'a'.repeat(2000);
    expect(classifyComplexity(complex)).toBe('complex');
  });

  it('should trim text before classification', () => {
    const text = '   Hello world   ';
    expect(classifyComplexity(text)).toBe('simple');
  });
});

// Task 3: Configurable classifier tests
describe('ComplexityClassifier (class)', () => {
  it('should use default thresholds when not configured', () => {
    const classifier = new ComplexityClassifier();

    expect(classifier.classify('a'.repeat(200))).toBe('simple');
    expect(classifier.classify('a'.repeat(201))).toBe('mid');
    expect(classifier.classify('a'.repeat(1000))).toBe('mid');
    expect(classifier.classify('a'.repeat(1001))).toBe('complex');
  });

  it('should respect custom simple threshold', () => {
    const classifier = new ComplexityClassifier({
      simpleMaxChars: 100,
    });

    expect(classifier.classify('a'.repeat(50))).toBe('simple');
    expect(classifier.classify('a'.repeat(100))).toBe('simple');
    expect(classifier.classify('a'.repeat(101))).toBe('mid');
  });

  it('should respect custom mid threshold', () => {
    const classifier = new ComplexityClassifier({
      midMaxChars: 500,
    });

    expect(classifier.classify('a'.repeat(200))).toBe('simple');
    expect(classifier.classify('a'.repeat(300))).toBe('mid');
    expect(classifier.classify('a'.repeat(500))).toBe('mid');
    expect(classifier.classify('a'.repeat(501))).toBe('complex');
  });

  it('should respect both custom thresholds', () => {
    const classifier = new ComplexityClassifier({
      simpleMaxChars: 100,
      midMaxChars: 500,
    });

    expect(classifier.classify('a'.repeat(50))).toBe('simple');
    expect(classifier.classify('a'.repeat(200))).toBe('mid');
    expect(classifier.classify('a'.repeat(600))).toBe('complex');
  });

  it('should handle edge cases at exact thresholds', () => {
    const classifier = new ComplexityClassifier({
      simpleMaxChars: 100,
      midMaxChars: 500,
    });

    // Exactly at thresholds should be inclusive
    expect(classifier.classify('a'.repeat(100))).toBe('simple');
    expect(classifier.classify('a'.repeat(500))).toBe('mid');
  });

  it('should trim whitespace before classification', () => {
    const classifier = new ComplexityClassifier({
      simpleMaxChars: 10,
    });

    expect(classifier.classify('   Hello   ')).toBe('simple'); // 5 chars after trim
    expect(classifier.classify('   ' + 'a'.repeat(15) + '   ')).toBe('mid'); // 15 chars after trim
  });
});
