import {
  AIModel,
  AIRequestMessage,
  AICompletionRequest,
  AICompletionResponse,
  AIStreamChunk,
  FinishReason,
  AIToolCall,
} from '@niazi-ai/types';

export interface OllamaModelTag {
  name: string;
  model: string;
  modified_at: string;
  size: number;
  digest: string;
  details?: {
    parent_model?: string;
    format?: string;
    family?: string;
    families?: string[];
    parameter_size?: string;
    quantization_level?: string;
  };
}

export interface OllamaChatResponse {
  model: string;
  created_at: string;
  message?: {
    role: string;
    content: string;
    tool_calls?: Array<{
      function: {
        name: string;
        arguments: Record<string, unknown>;
      };
    }>;
  };
  done: boolean;
  done_reason?: string;
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

export class OllamaMapper {
  public static mapModels(tags: readonly OllamaModelTag[], providerId: string): readonly AIModel[] {
    return tags.map((t) => {
      const family = t.details?.family?.toLowerCase() || '';
      const isCoder = t.name.includes('code') || family.includes('code');
      const isVision = t.name.includes('vision') || family.includes('vision') || family.includes('clip');

      return {
        id: `${providerId}:${t.name}`,
        modelId: t.name,
        providerId,
        displayName: `${t.name} (${t.details?.parameter_size || 'local'})`,
        capabilities: {
          streaming: true,
          toolCalling: !isVision && !t.name.includes('1b'),
          vision: isVision,
          structuredOutput: true,
          maxContextTokens: isCoder ? 32768 : 8192,
        },
        description: `Local Ollama model: ${t.name}, format ${t.details?.format || 'gguf'}`,
        isAvailable: true,
      };
    });
  }

  public static mapRequest(req: AICompletionRequest): Record<string, unknown> {
    const messages = req.messages.map((m: AIRequestMessage) => {
      const msg: Record<string, unknown> = {
        role: m.role,
        content: m.content,
      };

      if (m.images && m.images.length > 0) {
        msg['images'] = m.images.map((img) => img.data);
      }

      return msg;
    });

    const payload: Record<string, unknown> = {
      model: req.modelId,
      messages,
      stream: false,
    };

    if (req.responseFormat?.type === 'json') {
      payload['format'] = 'json';
    }

    const options: Record<string, unknown> = {};
    if (req.temperature !== undefined) options['temperature'] = req.temperature;
    if (req.topP !== undefined) options['top_p'] = req.topP;
    if (req.maxTokens !== undefined) options['num_predict'] = req.maxTokens;
    if (req.stopSequences && req.stopSequences.length > 0) options['stop'] = req.stopSequences;

    if (Object.keys(options).length > 0) {
      payload['options'] = options;
    }

    if (req.tools && req.tools.length > 0) {
      payload['tools'] = req.tools.map((t) => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
      }));
    }

    return payload;
  }

  public static mapResponse(
    raw: OllamaChatResponse,
    providerId: string,
    requestedModelId: string
  ): AICompletionResponse {
    let finishReason: FinishReason = 'stop';
    if (raw.done_reason === 'length') finishReason = 'length';

    let toolCalls: AIToolCall[] | undefined = undefined;
    if (raw.message?.tool_calls && raw.message.tool_calls.length > 0) {
      finishReason = 'tool_calls';
      toolCalls = raw.message.tool_calls.map((tc, idx) => ({
        id: `call_${idx}_${Date.now()}`,
        name: tc.function.name,
        arguments: tc.function.arguments,
      }));
    }

    return {
      content: raw.message?.content || '',
      modelId: raw.model || requestedModelId,
      providerId,
      toolCalls,
      finishReason,
      usage: raw.eval_count !== undefined && raw.prompt_eval_count !== undefined
        ? {
            promptTokens: raw.prompt_eval_count,
            completionTokens: raw.eval_count,
            totalTokens: raw.prompt_eval_count + raw.eval_count,
          }
        : undefined,
      rawMetadata: {
        totalDuration: raw.total_duration,
        evalDuration: raw.eval_duration,
      },
    };
  }

  public static mapStreamChunk(raw: OllamaChatResponse): AIStreamChunk {
    let finishReason: FinishReason | null = null;
    if (raw.done) {
      finishReason = raw.done_reason === 'length' ? 'length' : 'stop';
    }

    return {
      contentDelta: raw.message?.content,
      finishReason,
      usage: raw.done && raw.eval_count !== undefined && raw.prompt_eval_count !== undefined
        ? {
            promptTokens: raw.prompt_eval_count,
            completionTokens: raw.eval_count,
            totalTokens: raw.prompt_eval_count + raw.eval_count,
          }
        : undefined,
    };
  }
}

