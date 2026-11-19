import { TaskCategory, TaskRouteRule, ResolvedRoute, validateCapabilities } from '@niazi-ai/types';
import { ProviderRegistry } from '@niazi-ai/providers';
import { ModelSelector } from './model-selector.js';

export class RoutingError extends Error {
  constructor(message: string) {
    super(`[TaskRouter] ${message}`);
    this.name = 'RoutingError';
  }
}

export class TaskRouter {
  private readonly rules = new Map<TaskCategory, TaskRouteRule>();

  constructor(
    rules: readonly TaskRouteRule[],
    private readonly providerRegistry: ProviderRegistry,
    private readonly modelSelector: ModelSelector
  ) {
    for (const rule of rules) {
      this.rules.set(rule.taskCategory, rule);
    }
  }

  public setRule(rule: TaskRouteRule): void {
    this.rules.set(rule.taskCategory, rule);
  }

  public getRule(category: TaskCategory): TaskRouteRule | undefined {
    return this.rules.get(category);
  }

  public resolveRoute(category: TaskCategory): ResolvedRoute {
    const rule = this.rules.get(category);
    if (!rule) {
      throw new RoutingError(`No routing rule configured for task category: ${category}`);
    }

    // 1. Try Preferred Route
    const preferredProvider = this.providerRegistry.get(rule.preferredProviderId);
    if (preferredProvider) {
      const preferredModel = this.modelSelector.getModel(rule.preferredModelId);
      if (preferredModel && preferredModel.isAvailable) {
        if (rule.requiredCapabilities) {
          const capCheck = validateCapabilities(preferredModel.capabilities, rule.requiredCapabilities);
          if (capCheck.satisfied) {
            return {
              taskCategory: category,
              providerId: rule.preferredProviderId,
              modelId: rule.preferredModelId,
              isFallback: false,
              routeReason: 'Preferred provider and model satisfied requirements',
            };
          }
        } else {
          return {
            taskCategory: category,
            providerId: rule.preferredProviderId,
            modelId: rule.preferredModelId,
            isFallback: false,
            routeReason: 'Preferred provider and model available',
          };
        }
      }
    }

    // 2. Try Fallback Route
    if (rule.fallbackProviderId && rule.fallbackModelId) {
      const fallbackProvider = this.providerRegistry.get(rule.fallbackProviderId);
      if (fallbackProvider) {
        const fallbackModel = this.modelSelector.getModel(rule.fallbackModelId);
        if (fallbackModel && fallbackModel.isAvailable) {
          if (rule.requiredCapabilities) {
            const capCheck = validateCapabilities(fallbackModel.capabilities, rule.requiredCapabilities);
            if (capCheck.satisfied) {
              return {
                taskCategory: category,
                providerId: rule.fallbackProviderId,
                modelId: rule.fallbackModelId,
                isFallback: true,
                routeReason: 'Fallback provider selected because preferred was unavailable or lacked capabilities',
              };
            }
          } else {
            return {
              taskCategory: category,
              providerId: rule.fallbackProviderId,
              modelId: rule.fallbackModelId,
              isFallback: true,
              routeReason: 'Fallback provider selected because preferred was unavailable',
            };
          }
        }
      }
    }

    throw new RoutingError(
      `Failed to route task "${category}": preferred provider "${rule.preferredProviderId}" / model "${rule.preferredModelId}" is unavailable or does not satisfy requirements, and no valid fallback was available.`
    );
  }
}

