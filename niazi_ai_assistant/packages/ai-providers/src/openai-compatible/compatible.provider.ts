import {
  AIModel,
  AIProviderType,
  ConnectionResult,
  AICompletionRequest,
  AICompletionResponse,
  AIStreamChunk,
} from '@niazi-ai/types';
import { AIProviderConfig, SecretVault } from '@niazi-ai/config';
import { IAIProvider } from '../provider.interface.js';
import { AIProviderError } from '../errors/provider.error.js';
import {
  OpenAICompatibleMapper,
  OpenAIModelEntry,
  OpenAIChatCompletionResponse,
} from './compatible.mapper.js';

export class OpenAICompatibleProvider implements IAIProvider {
  public readonly id: string;
  public readonly name: string;
  public readonly type: AIProviderType = 'openai-compatible';

  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly authMethod: string;
  private readonly apiKeyRef?: string;
  private readonly customHeaders: Record<string, string>;

  constructor(config: AIProviderConfig) {
    this.id = config.id;
    this.name = config.name;
    this.baseUrl = config.baseUrl.replace(/\/+$/, '');
    this.timeoutMs = config.timeoutMs || 30000;
    this.authMethod = config.authMethod;
    this.apiKeyRef = config.apiKeyRef;
    this.customHeaders = config.customHeaders ? { ...config.customHeaders } : {};
  }

  private async buildHeaders(): Promise<Record<string, string>> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...this.customHeaders,
    };

    if (this.authMethod === 'bearer' && this.apiKeyRef) {
      const apiKey = await SecretVault.getInstance().getSecret(this.apiKeyRef);
      if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }
    }

    return headers;
  }

  public async testConnection(): Promise<ConnectionResult> {
    const start = Date.now();
    try {
      const headers = await this.buildHeaders();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), Math.min(this.timeoutMs, 5000));

      const res = await fetch(`${this.baseUrl}/models`, {
        method: 'GET',
        headers,
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!res.ok) {
        return {
          success: false,
          latencyMs: Date.now() - start,
          error: `Endpoint returned HTTP ${res.status}: ${res.statusText}`,
        };
      }

      const data = (await res.json()) as { data?: OpenAIModelEntry[] };
      const count = data.data ? data.data.length : 0;

      return {
        success: true,
        latencyMs: Date.now() - start,
        discoveredModelsCount: count,
      };
    } catch (err: unknown) {
      return {
        success: false,
        latencyMs: Date.now() - start,
        error: err instanceof Error ? err.message : 'Connection test failed',
      };
    }
  }

  public async listModels(): Promise<readonly AIModel[]> {
    try {
      const headers = await this.buildHeaders();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);

      const res = await fetch(`${this.baseUrl}/models`, {
        method: 'GET',
        headers,
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!res.ok) {
        throw new AIProviderError({
          code: res.status === 401 ? 'AUTH_FAILED' : 'CONNECTION_FAILED',
          providerId: this.id,
          message: `Failed to query /models: HTTP ${res.status}`,
          statusCode: res.status,
        });
      }

      const data = (await res.json()) as { data?: OpenAIModelEntry[] };
      if (!data.data || !Array.isArray(data.data)) {
        return [];
      }

      return OpenAICompatibleMapper.mapModels(data.data, this.id);
    } catch (err: unknown) {
      if (err instanceof AIProviderError) throw err;
      throw new AIProviderError({
        code: 'CONNECTION_FAILED',
        providerId: this.id,
        message: err instanceof Error ? err.message : 'Failed to list models',
        cause: err,
      });
    }
  }

  public async generate(request: AICompletionRequest): Promise<AICompletionResponse> {
    const payload = OpenAICompatibleMapper.mapRequest(request);
    payload['stream'] = false;

    const timeout = request.timeoutMs || this.timeoutMs;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      const headers = await this.buildHeaders();
      const res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!res.ok) {
        let errCode: import('../errors/provider.error.js').ProviderErrorCode = 'PROVIDER_INTERNAL';
        if (res.status === 401 || res.status === 403) errCode = 'AUTH_FAILED';
        else if (res.status === 404) errCode = 'MODEL_UNAVAILABLE';
        else if (res.status === 429) errCode = 'RATE_LIMITED';

        throw new AIProviderError({
          code: errCode,
          providerId: this.id,
          modelId: request.modelId,
          message: `OpenAI-compatible request failed with HTTP ${res.status}`,
          statusCode: res.status,
        });
      }

      const data = (await res.json()) as OpenAIChatCompletionResponse;
      return OpenAICompatibleMapper.mapResponse(data, this.id, request.modelId);
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
    const payload = OpenAICompatibleMapper.mapRequest(request);
    payload['stream'] = true;

    const timeout = request.timeoutMs || this.timeoutMs;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    let res: Response;
    try {
      const headers = await this.buildHeaders();
      res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers,
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
        message: isTimeout ? `Stream timed out after ${timeout}ms` : (err instanceof Error ? err.message : 'Stream failed'),
        cause: err,
      });
    }

    if (!res.ok || !res.body) {
      let errCode: import('../errors/provider.error.js').ProviderErrorCode = 'PROVIDER_INTERNAL';
      if (res.status === 401 || res.status === 403) errCode = 'AUTH_FAILED';
      else if (res.status === 404) errCode = 'MODEL_UNAVAILABLE';
      else if (res.status === 429) errCode = 'RATE_LIMITED';

      throw new AIProviderError({
        code: errCode,
        providerId: this.id,
        modelId: request.modelId,
        message: `Streaming failed with HTTP ${res.status}`,
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
          if (!trimmed || !trimmed.startsWith('data:')) continue;
          const dataStr = trimmed.slice(5).trim();
          if (dataStr === '[DONE]') return;

          try {
            const parsed = JSON.parse(dataStr) as OpenAIChatCompletionResponse;
            yield OpenAICompatibleMapper.mapStreamChunk(parsed);
          } catch {
            // Ignore incomplete JSON stream lines
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}

