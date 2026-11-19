import {
  AIModel,
  AIRequestMessage,
  AICompletionRequest,
  AICompletionResponse,
  AIStreamChunk,
  FinishReason,
  AIToolCall,
} from '@niazi-ai/types';

export interface OpenAIChatCompletionChoice {
  index: number;
  message?: {
    role: string;
    content: string | null;
    tool_calls?: Array<{
      id: string;
      type: string;
      function: {
        name: string;
        arguments: string;
      };
    }>;
  };
  delta?: {
    role?: string;
    content?: string | null;
    tool_calls?: Array<{
      index: number;
      id?: string;
      type?: string;
      function?: {
        name?: string;
        arguments?: string;
      };
    }>;
  };
  finish_reason?: string | null;
}

export interface OpenAIChatCompletionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: OpenAIChatCompletionChoice[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface OpenAIModelEntry {
  id: string;
  object: string;
  created?: number;
  owned_by?: string;
}

export class OpenAICompatibleMapper {
  public static mapModels(entries: readonly OpenAIModelEntry[], providerId: string): readonly AIModel[] {
    return entries.map((m) => {
      const isCoder = m.id.includes('coder') || m.id.includes('code');
      const isVision = m.id.includes('vision') || m.id.includes('4o');

      return {
        id: `${providerId}:${m.id}`,
        modelId: m.id,
        providerId,
        displayName: m.id,
        capabilities: {
          streaming: true,
          toolCalling: true,
          vision: isVision,
          structuredOutput: true,
          maxContextTokens: isCoder ? 64000 : 16384,
        },
        description: `OpenAI-compatible model: ${m.id} (owned by: ${m.owned_by || 'unknown'})`,
        isAvailable: true,
      };
    });
  }

  public static mapRequest(req: AICompletionRequest): Record<string, unknown> {
    const messages = req.messages.map((m: AIRequestMessage) => {
      if (m.images && m.images.length > 0) {
        const parts: Array<Record<string, unknown>> = [{ type: 'text', text: m.content }];
        for (const img of m.images) {
          parts.push({
            type: 'image_url',
            image_url: {
              url: img.type === 'base64' ? `data:${img.mimeType || 'image/jpeg'};base64,${img.data}` : img.data,
            },
          });
        }
        return {
          role: m.role,
          content: parts,
          name: m.name,
        };
      }

      return {
        role: m.role,
        content: m.content,
        name: m.name,
        tool_call_id: m.toolCallId,
      };
    });

    const payload: Record<string, unknown> = {
      model: req.modelId,
      messages,
      stream: false,
    };

    if (req.temperature !== undefined) payload['temperature'] = req.temperature;
    if (req.maxTokens !== undefined) payload['max_tokens'] = req.maxTokens;
    if (req.topP !== undefined) payload['top_p'] = req.topP;
    if (req.stopSequences && req.stopSequences.length > 0) payload['stop'] = req.stopSequences;

    if (req.responseFormat?.type === 'json') {
      payload['response_format'] = { type: 'json_object' };
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
    raw: OpenAIChatCompletionResponse,
    providerId: string,
    requestedModelId: string
  ): AICompletionResponse {
    const choice = raw.choices && raw.choices[0];
    let finishReason: FinishReason = 'stop';

    if (choice?.finish_reason === 'length') finishReason = 'length';
    if (choice?.finish_reason === 'tool_calls') finishReason = 'tool_calls';
    if (choice?.finish_reason === 'content_filter') finishReason = 'content_filter';

    let toolCalls: AIToolCall[] | undefined = undefined;
    if (choice?.message?.tool_calls && choice.message.tool_calls.length > 0) {
      toolCalls = choice.message.tool_calls.map((tc) => {
        let parsedArgs: Record<string, unknown> = {};
        try {
          parsedArgs = JSON.parse(tc.function.arguments);
        } catch {
          parsedArgs = { raw: tc.function.arguments };
        }
        return {
          id: tc.id,
          name: tc.function.name,
          arguments: parsedArgs,
        };
      });
    }

    return {
      content: choice?.message?.content || '',
      modelId: raw.model || requestedModelId,
      providerId,
      toolCalls,
      finishReason,
      usage: raw.usage
        ? {
            promptTokens: raw.usage.prompt_tokens,
            completionTokens: raw.usage.completion_tokens,
            totalTokens: raw.usage.total_tokens,
          }
        : undefined,
    };
  }

  public static mapStreamChunk(raw: OpenAIChatCompletionResponse): AIStreamChunk {
    const choice = raw.choices && raw.choices[0];
    let finishReason: FinishReason | null = null;

    if (choice?.finish_reason === 'length') finishReason = 'length';
    if (choice?.finish_reason === 'tool_calls') finishReason = 'tool_calls';
    if (choice?.finish_reason === 'stop') finishReason = 'stop';

    return {
      contentDelta: choice?.delta?.content || undefined,
      finishReason,
      usage: raw.usage
        ? {
            promptTokens: raw.usage.prompt_tokens,
            completionTokens: raw.usage.completion_tokens,
            totalTokens: raw.usage.total_tokens,
          }
        : undefined,
    };
  }
}

