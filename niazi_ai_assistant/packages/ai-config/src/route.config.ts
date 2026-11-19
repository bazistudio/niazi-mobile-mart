import { TaskCategory, TaskRouteRule } from '@niazi-ai/types';

export function validateRouteRule(rule: unknown): { valid: boolean; errors: readonly string[] } {
  const errors: string[] = [];
  if (!rule || typeof rule !== 'object') {
    return { valid: false, errors: ['Route rule must be an object'] };
  }

  const r = rule as Record<string, unknown>;

  const validCategories: TaskCategory[] = [
    'general_chat',
    'pos_reporting',
    'repo_analysis',
    'code_review',
    'fast_classification',
  ];

  if (typeof r['taskCategory'] !== 'string' || !validCategories.includes(r['taskCategory'] as TaskCategory)) {
    errors.push(`taskCategory must be one of: ${validCategories.join(', ')}`);
  }

  if (typeof r['preferredProviderId'] !== 'string' || !r['preferredProviderId'].trim()) {
    errors.push('preferredProviderId must be a non-empty string');
  }

  if (typeof r['preferredModelId'] !== 'string' || !r['preferredModelId'].trim()) {
    errors.push('preferredModelId must be a non-empty string');
  }

  if (r['fallbackProviderId'] !== undefined && (typeof r['fallbackProviderId'] !== 'string' || !r['fallbackProviderId'].trim())) {
    errors.push('fallbackProviderId must be a non-empty string if provided');
  }

  if (r['fallbackModelId'] !== undefined && (typeof r['fallbackModelId'] !== 'string' || !r['fallbackModelId'].trim())) {
    errors.push('fallbackModelId must be a non-empty string if provided');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export const DEFAULT_TASK_ROUTING_RULES: readonly TaskRouteRule[] = [
  {
    taskCategory: 'general_chat',
    preferredProviderId: 'ollama-local',
    preferredModelId: 'llama3.2:latest',
    fallbackProviderId: 'custom-compatible',
    fallbackModelId: 'gpt-3.5-turbo',
    description: 'Default conversation and general queries',
  },
  {
    taskCategory: 'repo_analysis',
    preferredProviderId: 'ollama-local',
    preferredModelId: 'qwen2.5-coder:latest',
    fallbackProviderId: 'custom-compatible',
    fallbackModelId: 'claude-3-5-sonnet-compatible',
    requiredCapabilities: {
      minContextTokens: 16000,
    },
    description: 'Codebase understanding and syntax tree exploration',
  },
  {
    taskCategory: 'code_review',
    preferredProviderId: 'ollama-local',
    preferredModelId: 'qwen2.5-coder:latest',
    fallbackProviderId: 'custom-compatible',
    fallbackModelId: 'deepseek-coder',
    description: 'Diff inspection and logic audit',
  },
  {
    taskCategory: 'fast_classification',
    preferredProviderId: 'ollama-local',
    preferredModelId: 'llama3.2:1b',
    description: 'Low-latency intent detection and prompt tagging',
  },
  {
    taskCategory: 'pos_reporting',
    preferredProviderId: 'ollama-local',
    preferredModelId: 'llama3.2:latest',
    description: 'Reserved for future business intelligence queries (read-only)',
  },
];

