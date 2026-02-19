/**
 * Cache Module - SlimClaw Plugin
 * 
 * Este módulo implementa a injeção de cache breakpoints para otimizar
 * o prompt caching da Anthropic Claude API.
 */

export {
  injectCacheBreakpoints,
  injectCacheBreakpointsSimple,
  createMessage,
  DEFAULT_CACHE_CONFIG,
  type CacheableMessage,
  type CacheInjectionConfig,
  type CacheInjectionResult,
  type ContentBlock,
} from './breakpoints.js';