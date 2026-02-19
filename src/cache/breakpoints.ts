/**
 * Cache Injection Module - SlimClaw
 * 
 * Injeta breakpoints de cache nas mensagens para otimizar o prompt caching da Anthropic.
 * Estratégias de cache:
 * 1. System prompts (sempre cachear)
 * 2. Mensagens longas (> threshold)
 * 3. Penúltima mensagem (pivot point)
 */

export interface ContentBlock {
  type: string;
  text?: string;
  [key: string]: unknown;
}

export interface CacheableMessage {
  role: string;
  content: string | ContentBlock[];
  cache_control?: { type: 'ephemeral' };
  [key: string]: unknown;
}

export interface CacheInjectionConfig {
  enabled: boolean;
  minContentLength: number;
}

export interface CacheInjectionResult {
  messages: CacheableMessage[];
  stats: {
    breakpointsInjected: number;
    eligibleMessages: number;
  };
}

/**
 * Configuração padrão para cache injection
 */
export const DEFAULT_CACHE_CONFIG: CacheInjectionConfig = {
  enabled: true,
  minContentLength: 1000,
};

/**
 * Estima o comprimento de conteúdo de uma mensagem
 */
function getContentLength(content: string | ContentBlock[]): number {
  if (typeof content === 'string') {
    return content.length;
  }
  
  if (Array.isArray(content)) {
    return content.reduce((total, block) => {
      if (block.text) {
        return total + block.text.length;
      }
      // Para outros tipos de conteúdo, contar como JSON stringified
      return total + JSON.stringify(block).length;
    }, 0);
  }
  
  return 0;
}

/**
 * Determina se uma mensagem deve receber cache breakpoint
 */
function shouldCache(
  message: CacheableMessage, 
  index: number, 
  totalMessages: number, 
  config: CacheInjectionConfig
): boolean {
  // Se cache desabilitado, não cachear nada
  if (!config.enabled) {
    return false;
  }

  // 1. System prompts sempre cachear
  if (message.role === 'system') {
    return true;
  }

  // 2. Mensagens longas
  const contentLength = getContentLength(message.content);
  if (contentLength >= config.minContentLength) {
    return true;
  }

  // 3. Penúltima mensagem (pivot point para conversas)
  // Só aplica se há pelo menos 3 mensagens
  if (totalMessages >= 3 && index === totalMessages - 2) {
    return true;
  }

  return false;
}

/**
 * Injeta breakpoints de cache nas mensagens
 * 
 * @param messages Array de mensagens para processar
 * @param config Configuração de cache injection
 * @returns Resultado com mensagens processadas e estatísticas
 */
export function injectCacheBreakpoints(
  messages: CacheableMessage[],
  config: CacheInjectionConfig = DEFAULT_CACHE_CONFIG
): CacheInjectionResult {
  if (!messages.length) {
    return {
      messages: [],
      stats: {
        breakpointsInjected: 0,
        eligibleMessages: 0,
      },
    };
  }

  let breakpointsInjected = 0;
  let eligibleMessages = 0;

  const processedMessages = messages.map((message, index) => {
    // Criar cópia da mensagem para não mutar o original
    const processedMessage: CacheableMessage = { ...message };

    // Determinar se deve cachear esta mensagem
    const shouldCacheMessage = shouldCache(
      message, 
      index, 
      messages.length, 
      config
    );

    if (shouldCacheMessage) {
      eligibleMessages++;
      
      // Só injeta se ainda não tem cache_control
      if (!message.cache_control) {
        processedMessage.cache_control = { type: 'ephemeral' };
        breakpointsInjected++;
      }
    }

    return processedMessage;
  });

  return {
    messages: processedMessages,
    stats: {
      breakpointsInjected,
      eligibleMessages,
    },
  };
}

/**
 * Versão simplificada que retorna apenas as mensagens
 */
export function injectCacheBreakpointsSimple(
  messages: CacheableMessage[],
  config: CacheInjectionConfig = DEFAULT_CACHE_CONFIG
): CacheableMessage[] {
  return injectCacheBreakpoints(messages, config).messages;
}

/**
 * Helper para criar mensagens de teste
 */
export function createMessage(
  role: string, 
  content: string | ContentBlock[],
  cache_control?: { type: 'ephemeral' }
): CacheableMessage {
  const message: CacheableMessage = { role, content };
  if (cache_control) {
    message.cache_control = cache_control;
  }
  return message;
}