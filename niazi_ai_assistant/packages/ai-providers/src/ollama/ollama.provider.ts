import {
  AIModel,
  AIProviderType,
  ConnectionResult,
  AICompletionRequest,
  AICompletionResponse,
  AIStreamChunk,
} from '@niazi-ai/types';
import { AIProviderConfig } from '@niazi-ai/config';
import { IAIProvider } from '../provider.interface.js';
import { AIProviderError } from '../errors/provider.error.js';
import { OllamaMapper, OllamaModelTag, OllamaChatResponse } from './ollama.mapper.js';

export class OllamaProvider implements IAIProvider {
  public readonly id: string;
  public readonly name: string;
  public readonly type: AIProviderType = 'ollama';

  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(config: AIProviderConfig) {
    this.id = config.id;
    this.name = config.name;
    this.baseUrl = config.baseUrl.replace(/\/+$/, '');
    this.timeoutMs = config.timeoutMs || 60000;
  }

  public async testConnection(): Promise<ConnectionResult> {
    const start = Date.now();
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), Math.min(this.timeoutMs, 5000));

      const res = await fetch(`${this.baseUrl}/api/tags`, {
        method: 'GET',
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!res.ok) {
        return {
          success: false,
          latencyMs: Date.now() - start,
          error: `Ollama returned HTTP ${res.status}: ${res.statusText}`,
        };
      }

      const data = (await res.json()) as { models?: OllamaModelTag[] };
      const count = data.models ? data.models.length : 0;

      return {
        success: true,
        latencyMs: Date.now() - start,
        discoveredModelsCount: count,
      };
    } catch (err: unknown) {
      return {
        success: false,
        latencyMs: Date.now() - start,
        error: err instanceof Error ? err.message : 'Unknown connection failure',
      };
    }
  }

  public async listModels(): Promise<readonly AIModel[]> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);

      const res = await fetch(`${this.baseUrl}/api/tags`, {
        method: 'GET',
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!res.ok) {
        throw new AIProviderError({
          code: 'CONNECTION_FAILED',
          providerId: this.id,
          message: `Failed to list models: HTTP ${res.status}`,
          statusCode: res.status,
        });
      }

      const data = (await res.json()) as { models?: OllamaModelTag[] };
      if (!data.models || !Array.isArray(data.models)) {
        return [];
      }

      return OllamaMapper.mapModels(data.models, this.id);
    } catch (err: unknown) {
      if (err instanceof AIProviderError) throw err;
      throw new AIProviderError({
        code: 'CONNECTION_FAILED',
        providerId: this.id,
        message: err instanceof Error ? err.message : 'Failed to query Ollama models',
        cause: err,
      });
    }
  }

  public async generate(request: AICompletionRequest): Promise<AICompletionResponse> {
    const payload = OllamaMapper.mapRequest(request);
    payload['stream'] = false;

    const timeout = request.timeoutMs || this.timeoutMs;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      const res = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!res.ok) {
        throw new AIProviderError({
          code: res.status === 404 ? 'MODEL_UNAVAILABLE' : 'PROVIDER_INTERNAL',
          providerId: this.id,
          modelId: request.modelId,
          message: `Ollama chat request failed with HTTP ${res.status}`,
          statusCode: res.status,
        });
      }

      const data = (await res.json()) as OllamaChatResponse;
      return OllamaMapper.mapResponse(data, this.id, request.modelId);
    } catch (err: unknown) {
      clearTimeout(timer);
      if (err instanceof AIProviderError) throw err;

      const isTimeout = err instanceof Error && err.name === 'AbortError';
      throw new AIProviderError({
        code: isTimeout ? 'TIMEOUT' : 'CONNECTION_FAILED',
        providerId: this.id,
        modelId: request.modelId,
        message: isTimeout ? `Request timed out after ${timeout}ms` : (err instanceof Error ? err.message : 'Request failed'),
        cause: err,
      });
    }
  }

  public async *stream(request: AICompletionRequest): AsyncIterable<AIStreamChunk> {
    const payload = OllamaMapper.mapRequest(request);
    payload['stream'] = true;

    const timeout = request.timeoutMs || this.timeoutMs;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timer);
    } catch (err: unknown) {
      clearTimeout(timer);
      const isTimeout = err instanceof Error && err.name === 'AbortError';
      throw new AIProviderError({
        code: isTimeout ? 'TIMEOUT' : 'CONNECTION_FAILED',
        providerId: this.id,
        modelId: request.modelId,
        message: isTimeout ? `Streaming request timed out after ${timeout}ms` : (err instanceof Error ? err.message : 'Stream request failed'),
        cause: err,
      });
    }

    if (!res.ok || !res.body) {
      throw new AIProviderError({
        code: res.status === 404 ? 'MODEL_UNAVAILABLE' : 'PROVIDER_INTERNAL',
        providerId: this.id,
        modelId: request.modelId,
        message: `Ollama streaming chat failed with HTTP ${res.status}`,
        statusCode: res.status,
      });
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const parsed = JSON.parse(trimmed) as OllamaChatResponse;
            yield OllamaMapper.mapStreamChunk(parsed);
          } catch {
            // Ignore corrupted line fragments in stream
          }
        }
      }

      if (buffer.trim()) {
        try {
          const parsed = JSON.parse(buffer.trim()) as OllamaChatResponse;
          yield OllamaMapper.mapStreamChunk(parsed);
        } catch {
          // Ignore trailing fragment
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}

