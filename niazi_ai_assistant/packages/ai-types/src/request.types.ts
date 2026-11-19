import { AIRequestMessage } from './message.types.js';

export interface AIToolParameterSchema {
  readonly type: string;
  readonly properties?: Record<string, unknown>;
  readonly required?: readonly string[];
  readonly description?: string;
}

export interface AIToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly parameters: AIToolParameterSchema;
}

export interface ResponseFormatOption {
  readonly type: 'text' | 'json';
  readonly schema?: Record<string, unknown>;
}

export interface AICompletionRequest {
  readonly modelId: string;
  readonly messages: readonly AIRequestMessage[];
  readonly temperature?: number;
  readonly maxTokens?: number;
  readonly topP?: number;
  readonly stopSequences?: readonly string[];
  readonly tools?: readonly AIToolDefinition[];
  readonly responseFormat?: ResponseFormatOption;
  readonly timeoutMs?: number;
}

