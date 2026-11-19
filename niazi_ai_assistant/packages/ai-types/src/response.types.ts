export interface AIToolCall {
  readonly id: string;
  readonly name: string;
  readonly arguments: Record<string, unknown>;
}

export interface AIUsage {
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly totalTokens: number;
}

export type FinishReason = 'stop' | 'length' | 'tool_calls' | 'content_filter' | 'timeout' | 'error';

export interface AICompletionResponse {
  readonly content: string;
  readonly modelId: string;
  readonly providerId: string;
  readonly toolCalls?: readonly AIToolCall[];
  readonly finishReason: FinishReason;
  readonly usage?: AIUsage;
  readonly rawMetadata?: Record<string, unknown>;
}

export interface AIStreamChunk {
  readonly contentDelta?: string;
  readonly toolCallDelta?: {
    readonly id?: string;
    readonly name?: string;
    readonly argumentsDelta?: string;
  };
  readonly finishReason?: FinishReason | null;
  readonly usage?: AIUsage;
}

