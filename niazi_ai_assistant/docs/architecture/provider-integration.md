# Provider Integration Specification

To connect a new AI engine or custom model endpoint, implement the `IAIProvider` interface defined in `@niazi-ai/providers`.

## 1. Required Contract

```typescript
export interface IAIProvider {
  readonly id: string;
  readonly name: string;
  readonly type: AIProviderType;

  testConnection(): Promise<ConnectionResult>;
  listModels(): Promise<readonly AIModel[]>;
  generate(request: AICompletionRequest): Promise<AICompletionResponse>;
  stream(request: AICompletionRequest): AsyncIterable<AIStreamChunk>;
}
```

## 2. Implementation Rules

1. **Normalized Error Handling**: Wrap network or API errors in `AIProviderError` with a standard `ProviderErrorCode` (`CONNECTION_FAILED`, `AUTH_FAILED`, `TIMEOUT`, `RATE_LIMITED`, etc.).
2. **Streaming Protocol**: Yield `AIStreamChunk` objects matching the standard delta format.
3. **No Direct Secret Storage**: Access API keys dynamically via `SecretVault.getInstance().getSecret(config.apiKeyRef)` rather than storing plain text strings in provider state.

