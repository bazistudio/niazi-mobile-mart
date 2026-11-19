export type ProviderErrorCode =
  | 'CONNECTION_FAILED'
  | 'AUTH_FAILED'
  | 'UNSUPPORTED_CAPABILITY'
  | 'MODEL_UNAVAILABLE'
  | 'TIMEOUT'
  | 'RATE_LIMITED'
  | 'INVALID_RESPONSE'
  | 'PROVIDER_INTERNAL';

export class AIProviderError extends Error {
  public readonly code: ProviderErrorCode;
  public readonly providerId: string;
  public readonly modelId?: string;
  public readonly statusCode?: number;
  public readonly isRetryable: boolean;

  constructor(options: {
    code: ProviderErrorCode;
    providerId: string;
    message: string;
    modelId?: string;
    statusCode?: number;
    cause?: unknown;
  }) {
    super(`[${options.providerId}] ${options.code}: ${options.message}`);
    this.name = 'AIProviderError';
    this.code = options.code;
    this.providerId = options.providerId;
    this.modelId = options.modelId;
    this.statusCode = options.statusCode;

    // Retryable status codes: network timeout, 429 rate limit, 503 unavailable
    this.isRetryable =
      options.code === 'TIMEOUT' ||
      options.code === 'RATE_LIMITED' ||
      options.statusCode === 429 ||
      options.statusCode === 503;

    if (options.cause) {
      this.cause = options.cause;
    }
  }
}

