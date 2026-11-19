import { AIProviderType, AuthMethod } from '@niazi-ai/types';

export interface AIProviderConfig {
  readonly id: string;
  readonly type: AIProviderType;
  readonly name: string;
  readonly baseUrl: string;
  readonly enabled: boolean;
  readonly timeoutMs: number;
  readonly authMethod: AuthMethod;
  readonly apiKeyRef?: string;
  readonly customHeaders?: Readonly<Record<string, string>>;
}

export function validateProviderConfig(config: unknown): { valid: boolean; errors: readonly string[] } {
  const errors: string[] = [];
  if (!config || typeof config !== 'object') {
    return { valid: false, errors: ['Configuration must be a non-null object'] };
  }

  const c = config as Record<string, unknown>;

  if (typeof c['id'] !== 'string' || !c['id'].trim()) {
    errors.push('Provider "id" must be a non-empty string');
  }

  const validTypes: AIProviderType[] = ['ollama', 'openai-compatible', 'openai', 'anthropic', 'gemini', 'custom'];
  if (typeof c['type'] !== 'string' || !validTypes.includes(c['type'] as AIProviderType)) {
    errors.push(`Provider "type" must be one of: ${validTypes.join(', ')}`);
  }

  if (typeof c['name'] !== 'string' || !c['name'].trim()) {
    errors.push('Provider "name" must be a non-empty string');
  }

  if (typeof c['baseUrl'] !== 'string' || !c['baseUrl'].trim()) {
    errors.push('Provider "baseUrl" must be a non-empty string');
  } else {
    try {
      new URL(c['baseUrl'] as string);
    } catch {
      errors.push('Provider "baseUrl" must be a valid URL string');
    }
  }

  if (typeof c['enabled'] !== 'boolean') {
    errors.push('Provider "enabled" must be a boolean');
  }

  if (typeof c['timeoutMs'] !== 'number' || c['timeoutMs'] <= 0) {
    errors.push('Provider "timeoutMs" must be a positive integer');
  }

  const validAuth: AuthMethod[] = ['none', 'bearer', 'header'];
  if (typeof c['authMethod'] !== 'string' || !validAuth.includes(c['authMethod'] as AuthMethod)) {
    errors.push(`Provider "authMethod" must be one of: ${validAuth.join(', ')}`);
  }

  if (c['apiKeyRef'] !== undefined && (typeof c['apiKeyRef'] !== 'string' || !c['apiKeyRef'].trim())) {
    errors.push('Provider "apiKeyRef", if provided, must be a non-empty string reference');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

