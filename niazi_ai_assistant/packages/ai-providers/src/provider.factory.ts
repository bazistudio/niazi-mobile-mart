import { AIProviderConfig } from '@niazi-ai/config';
import { IAIProvider } from './provider.interface.js';
import { OllamaProvider } from './ollama/ollama.provider.js';
import { OpenAICompatibleProvider } from './openai-compatible/compatible.provider.js';
import { AIProviderError } from './errors/provider.error.js';

export class ProviderFactory {
  public static create(config: AIProviderConfig): IAIProvider {
    switch (config.type) {
      case 'ollama':
        return new OllamaProvider(config);
      case 'openai-compatible':
      case 'custom':
        return new OpenAICompatibleProvider(config);
      case 'openai':
      case 'anthropic':
      case 'gemini':
        throw new AIProviderError({
          code: 'UNSUPPORTED_CAPABILITY',
          providerId: config.id,
          message: `Provider type "${config.type}" is reserved for future phases and not implemented in Phase 1`,
        });
      default:
        throw new AIProviderError({
          code: 'UNSUPPORTED_CAPABILITY',
          providerId: config.id,
          message: `Unknown or unsupported provider type: ${(config as { type: string }).type}`,
        });
    }
  }
}

