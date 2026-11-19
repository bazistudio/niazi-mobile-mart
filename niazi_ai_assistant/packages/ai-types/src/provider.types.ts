export type AIProviderType =
  | 'ollama'
  | 'openai-compatible'
  | 'openai'
  | 'anthropic'
  | 'gemini'
  | 'custom';

export type AuthMethod = 'none' | 'bearer' | 'header';

export interface ConnectionResult {
  readonly success: boolean;
  readonly latencyMs: number;
  readonly error?: string;
  readonly discoveredModelsCount?: number;
}

