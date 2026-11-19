import { AIModelCapability } from '@niazi-ai/types';

export interface ModelRegistrationConfig {
  readonly id: string;
  readonly modelId: string;
  readonly providerId: string;
  readonly displayName: string;
  readonly capabilities: AIModelCapability;
  readonly description?: string;
  readonly enabled: boolean;
}

export function validateModelConfig(config: unknown): { valid: boolean; errors: readonly string[] } {
  const errors: string[] = [];
  if (!config || typeof config !== 'object') {
    return { valid: false, errors: ['Model configuration must be an object'] };
  }

  const m = config as Record<string, unknown>;

  if (typeof m['id'] !== 'string' || !m['id'].trim()) {
    errors.push('Model "id" must be a non-empty string');
  }

  if (typeof m['modelId'] !== 'string' || !m['modelId'].trim()) {
    errors.push('Model "modelId" must be a non-empty string');
  }

  if (typeof m['providerId'] !== 'string' || !m['providerId'].trim()) {
    errors.push('Model "providerId" must be a non-empty string');
  }

  if (typeof m['displayName'] !== 'string' || !m['displayName'].trim()) {
    errors.push('Model "displayName" must be a non-empty string');
  }

  if (!m['capabilities'] || typeof m['capabilities'] !== 'object') {
    errors.push('Model "capabilities" must be an object');
  } else {
    const caps = m['capabilities'] as Record<string, unknown>;
    if (typeof caps['streaming'] !== 'boolean') errors.push('capabilities.streaming must be a boolean');
    if (typeof caps['toolCalling'] !== 'boolean') errors.push('capabilities.toolCalling must be a boolean');
    if (typeof caps['vision'] !== 'boolean') errors.push('capabilities.vision must be a boolean');
    if (typeof caps['structuredOutput'] !== 'boolean') errors.push('capabilities.structuredOutput must be a boolean');
    if (typeof caps['maxContextTokens'] !== 'number' || caps['maxContextTokens'] <= 0) {
      errors.push('capabilities.maxContextTokens must be a positive number');
    }
  }

  if (typeof m['enabled'] !== 'boolean') {
    errors.push('Model "enabled" must be a boolean');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

