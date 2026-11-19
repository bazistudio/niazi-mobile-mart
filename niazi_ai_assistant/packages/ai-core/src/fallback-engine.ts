import { TaskCategory, ResolvedRoute } from '@niazi-ai/types';
import { ProviderRegistry, AIProviderError } from '@niazi-ai/providers';
import { TaskRouter } from './task-router.js';

export class FallbackEngine {
  constructor(
    private readonly taskRouter: TaskRouter,
    private readonly providerRegistry: ProviderRegistry
  ) {}

  public getAlternativeRoute(
    category: TaskCategory,
    failedProviderId: string,
    error: unknown
  ): ResolvedRoute | null {
    // Check if error is ambiguous (e.g. streaming already started or non-retryable logic error)
    if (error instanceof AIProviderError && !error.isRetryable && error.code !== 'CONNECTION_FAILED' && error.code !== 'TIMEOUT') {
      return null;
    }

    const rule = this.taskRouter.getRule(category);
    if (!rule) {
      return null;
    }

    // If preferred failed, check fallback
    if (rule.preferredProviderId === failedProviderId && rule.fallbackProviderId && rule.fallbackModelId) {
      const fallbackProvider = this.providerRegistry.get(rule.fallbackProviderId);
      if (fallbackProvider) {
        return {
          taskCategory: category,
          providerId: rule.fallbackProviderId,
          modelId: rule.fallbackModelId,
          isFallback: true,
          routeReason: `Switched to fallback after error on preferred provider "${failedProviderId}"`,
        };
      }
    }

    return null;
  }
}

