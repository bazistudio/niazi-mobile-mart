import { CapabilityRequirement } from './capability.types.js';

export type TaskCategory =
  | 'general_chat'
  | 'pos_reporting'
  | 'repo_analysis'
  | 'code_review'
  | 'fast_classification';

export interface TaskRouteRule {
  readonly taskCategory: TaskCategory;
  readonly preferredProviderId: string;
  readonly preferredModelId: string;
  readonly fallbackProviderId?: string;
  readonly fallbackModelId?: string;
  readonly requiredCapabilities?: CapabilityRequirement;
  readonly description?: string;
}

export interface ResolvedRoute {
  readonly taskCategory: TaskCategory;
  readonly providerId: string;
  readonly modelId: string;
  readonly isFallback: boolean;
  readonly routeReason: string;
}

