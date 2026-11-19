import {
  AICompletionRequest,
  AICompletionResponse,
  AIStreamChunk,
  TaskCategory,
} from '@niazi-ai/types';
import { ProviderRegistry, AIProviderError } from '@niazi-ai/providers';
import { TaskRouter } from './task-router.js';
import { FallbackEngine } from './fallback-engine.js';

export class AssistantOrchestrator {
  constructor(
    private readonly taskRouter: TaskRouter,
    private readonly providerRegistry: ProviderRegistry,
    private readonly fallbackEngine: FallbackEngine
  ) {}

  public async completeTask(
    category: TaskCategory,
    requestWithoutModel: Omit<AICompletionRequest, 'modelId'>
  ): Promise<AICompletionResponse> {
    const route = this.taskRouter.resolveRoute(category);
    const provider = this.providerRegistry.get(route.providerId);

    if (!provider) {
      throw new AIProviderError({
        code: 'CONNECTION_FAILED',
        providerId: route.providerId,
        message: `Routed provider "${route.providerId}" is not available in registry`,
      });
    }

    const fullRequest: AICompletionRequest = {
      ...requestWithoutModel,
      modelId: route.modelId,
    };

    try {
      return await provider.generate(fullRequest);
    } catch (err: unknown) {
      // Evaluate safe fallback
      const altRoute = this.fallbackEngine.getAlternativeRoute(category, route.providerId, err);
      if (altRoute) {
        const fallbackProvider = this.providerRegistry.get(altRoute.providerId);
        if (fallbackProvider) {
          const fallbackReq: AICompletionRequest = {
            ...requestWithoutModel,
            modelId: altRoute.modelId,
          };
          return await fallbackProvider.generate(fallbackReq);
        }
      }
      throw err;
    }
  }

  public async *streamTask(
    category: TaskCategory,
    requestWithoutModel: Omit<AICompletionRequest, 'modelId'>
  ): AsyncIterable<AIStreamChunk> {
    const route = this.taskRouter.resolveRoute(category);
    const provider = this.providerRegistry.get(route.providerId);

    if (!provider) {
      throw new AIProviderError({
        code: 'CONNECTION_FAILED',
        providerId: route.providerId,
        message: `Routed provider "${route.providerId}" is not available in registry`,
      });
    }

    const fullRequest: AICompletionRequest = {
      ...requestWithoutModel,
      modelId: route.modelId,
    };

    yield* provider.stream(fullRequest);
  }
}

