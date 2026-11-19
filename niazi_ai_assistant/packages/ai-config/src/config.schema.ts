import { AIProviderConfig, validateProviderConfig } from './provider.config.js';
import { ModelRegistrationConfig, validateModelConfig } from './model.config.js';
import { TaskRouteRule } from '@niazi-ai/types';
import { validateRouteRule, DEFAULT_TASK_ROUTING_RULES } from './route.config.js';

export interface NiaziSystemConfig {
  readonly version: string;
  readonly defaultProviderId: string;
  readonly providers: readonly AIProviderConfig[];
  readonly models: readonly ModelRegistrationConfig[];
  readonly routes: readonly TaskRouteRule[];
}

export function validateSystemConfig(config: unknown): { valid: boolean; errors: readonly string[] } {
  const errors: string[] = [];
  if (!config || typeof config !== 'object') {
    return { valid: false, errors: ['System configuration must be an object'] };
  }

  const sc = config as Record<string, unknown>;

  if (typeof sc['version'] !== 'string' || !sc['version'].trim()) {
    errors.push('System config "version" must be defined');
  }

  if (typeof sc['defaultProviderId'] !== 'string' || !sc['defaultProviderId'].trim()) {
    errors.push('System config "defaultProviderId" must be defined');
  }

  if (!Array.isArray(sc['providers'])) {
    errors.push('"providers" must be an array');
  } else {
    sc['providers'].forEach((p, idx) => {
      const res = validateProviderConfig(p);
      if (!res.valid) {
        errors.push(`Provider[${idx}] error: ${res.errors.join('; ')}`);
      }
    });
  }

  if (!Array.isArray(sc['models'])) {
    errors.push('"models" must be an array');
  } else {
    sc['models'].forEach((m, idx) => {
      const res = validateModelConfig(m);
      if (!res.valid) {
        errors.push(`Model[${idx}] error: ${res.errors.join('; ')}`);
      }
    });
  }

  if (!Array.isArray(sc['routes'])) {
    errors.push('"routes" must be an array');
  } else {
    sc['routes'].forEach((r, idx) => {
      const res = validateRouteRule(r);
      if (!res.valid) {
        errors.push(`Route[${idx}] error: ${res.errors.join('; ')}`);
      }
    });
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export const DEFAULT_SYSTEM_CONFIG: NiaziSystemConfig = {
  version: '1.0.0',
  defaultProviderId: 'ollama-local',
  providers: [
    {
      id: 'ollama-local',
      type: 'ollama',
      name: 'Local Ollama Engine',
      baseUrl: 'http://localhost:11434',
      enabled: true,
      timeoutMs: 60000,
      authMethod: 'none',
    },
    {
      id: 'custom-compatible',
      type: 'openai-compatible',
      name: 'Generic OpenAI-Compatible Gateway',
      baseUrl: 'http://localhost:8000/v1',
      enabled: false,
      timeoutMs: 30000,
      authMethod: 'bearer',
      apiKeyRef: 'OPENAI_COMPATIBLE_API_KEY',
    },
  ],
  models: [
    {
      id: 'llama3.2:latest',
      modelId: 'llama3.2:latest',
      providerId: 'ollama-local',
      displayName: 'Llama 3.2 3B (Local)',
      capabilities: {
        streaming: true,
        toolCalling: true,
        vision: false,
        structuredOutput: true,
        maxContextTokens: 128000,
      },
      description: 'Default local language model for conversation and general reasoning',
      enabled: true,
    },
    {
      id: 'qwen2.5-coder:latest',
      modelId: 'qwen2.5-coder:latest',
      providerId: 'ollama-local',
      displayName: 'Qwen 2.5 Coder 7B (Local)',
      capabilities: {
        streaming: true,
        toolCalling: true,
        vision: false,
        structuredOutput: true,
        maxContextTokens: 32768,
      },
      description: 'Specialized code analysis and syntax review model',
      enabled: true,
    },
  ],
  routes: DEFAULT_TASK_ROUTING_RULES,
};

