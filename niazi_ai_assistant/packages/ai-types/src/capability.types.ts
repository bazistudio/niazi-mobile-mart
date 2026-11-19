import { AIModelCapability } from './model.types.js';

export interface CapabilityRequirement {
  readonly streamingRequired?: boolean;
  readonly toolCallingRequired?: boolean;
  readonly visionRequired?: boolean;
  readonly structuredOutputRequired?: boolean;
  readonly minContextTokens?: number;
}

export function validateCapabilities(
  available: AIModelCapability,
  required: CapabilityRequirement
): { satisfied: boolean; missing: readonly string[] } {
  const missing: string[] = [];

  if (required.streamingRequired && !available.streaming) {
    missing.push('streaming');
  }
  if (required.toolCallingRequired && !available.toolCalling) {
    missing.push('toolCalling');
  }
  if (required.visionRequired && !available.vision) {
    missing.push('vision');
  }
  if (required.structuredOutputRequired && !available.structuredOutput) {
    missing.push('structuredOutput');
  }
  if (required.minContextTokens && available.maxContextTokens < required.minContextTokens) {
    missing.push(`minContextTokens (requires ${required.minContextTokens}, model supports ${available.maxContextTokens})`);
  }

  return {
    satisfied: missing.length === 0,
    missing,
  };
}

