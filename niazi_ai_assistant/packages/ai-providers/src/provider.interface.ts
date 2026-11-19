import {
  AIProviderType,
  ConnectionResult,
  AIModel,
  AICompletionRequest,
  AICompletionResponse,
  AIStreamChunk,
} from '@niazi-ai/types';

export interface IAIProvider {
  readonly id: string;
  readonly name: string;
  readonly type: AIProviderType;

  testConnection(): Promise<ConnectionResult>;

  listModels(): Promise<readonly AIModel[]>;

  generate(request: AICompletionRequest): Promise<AICompletionResponse>;

  stream(request: AICompletionRequest): AsyncIterable<AIStreamChunk>;
}

