export interface AIModelCapability {
  readonly streaming: boolean;
  readonly toolCalling: boolean;
  readonly vision: boolean;
  readonly structuredOutput: boolean;
  readonly maxContextTokens: number;
}

export interface AIModel {
  readonly id: string;               // Unique combined or specific model identifier (e.g. "llama3.2:latest", "mistral-small")
  readonly modelId: string;          // Provider-native model name/tag
  readonly providerId: string;       // ID of the owning provider instance
  readonly displayName: string;
  readonly capabilities: AIModelCapability;
  readonly description?: string;
  readonly isAvailable: boolean;
}

