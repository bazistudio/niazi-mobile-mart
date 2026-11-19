import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ModelSelector,
  TaskRouter,
  RoutingError,
  FallbackEngine,
} from '../../packages/ai-core/dist/index.js';
import { ProviderRegistry } from '../../packages/ai-providers/dist/index.js';

test('ai-core: TaskRouter resolves preferred route when available and capable', () => {
  const registry = ProviderRegistry.getInstance();
  registry.clear();

  const mockProvider = {
    id: 'ollama-local',
    name: 'Ollama',
    type: 'ollama',
    testConnection: async () => ({ success: true, latencyMs: 5 }),
    listModels: async () => [],
    generate: async () => ({ content: 'ok', modelId: 'm1', providerId: 'p1', finishReason: 'stop' }),
    stream: async function* () {},
  };
  registry.register(mockProvider);

  const modelSelector = new ModelSelector([
    {
      id: 'llama3.2:latest',
      modelId: 'llama3.2:latest',
      providerId: 'ollama-local',
      displayName: 'Llama 3.2',
      capabilities: {
        streaming: true,
        toolCalling: true,
        vision: false,
        structuredOutput: true,
        maxContextTokens: 128000,
      },
      enabled: true,
    },
  ]);

  const router = new TaskRouter(
    [
      {
        taskCategory: 'general_chat',
        preferredProviderId: 'ollama-local',
        preferredModelId: 'llama3.2:latest',
      },
    ],
    registry,
    modelSelector
  );

  const route = router.resolveRoute('general_chat');
  assert.equal(route.providerId, 'ollama-local');
  assert.equal(route.modelId, 'llama3.2:latest');
  assert.equal(route.isFallback, false);
});

test('ai-core: TaskRouter switches to fallback when preferred provider is unavailable', () => {
  const registry = ProviderRegistry.getInstance();
  registry.clear();

  // Only fallback provider is registered/enabled
  const mockFallbackProvider = {
    id: 'custom-gateway',
    name: 'Fallback Gateway',
    type: 'openai-compatible',
    testConnection: async () => ({ success: true, latencyMs: 5 }),
    listModels: async () => [],
    generate: async () => ({ content: 'fallback ok', modelId: 'm2', providerId: 'p2', finishReason: 'stop' }),
    stream: async function* () {},
  };
  registry.register(mockFallbackProvider);

  const modelSelector = new ModelSelector([
    {
      id: 'backup-model',
      modelId: 'backup-model',
      providerId: 'custom-gateway',
      displayName: 'Backup Model',
      capabilities: {
        streaming: true,
        toolCalling: true,
        vision: false,
        structuredOutput: true,
        maxContextTokens: 16000,
      },
      enabled: true,
    },
  ]);

  const router = new TaskRouter(
    [
      {
        taskCategory: 'repo_analysis',
        preferredProviderId: 'offline-provider',
        preferredModelId: 'offline-model',
        fallbackProviderId: 'custom-gateway',
        fallbackModelId: 'backup-model',
      },
    ],
    registry,
    modelSelector
  );

  const route = router.resolveRoute('repo_analysis');
  assert.equal(route.providerId, 'custom-gateway');
  assert.equal(route.modelId, 'backup-model');
  assert.equal(route.isFallback, true);
});

test('ai-core: TaskRouter throws RoutingError when no provider satisfies route', () => {
  const registry = ProviderRegistry.getInstance();
  registry.clear();

  const modelSelector = new ModelSelector([]);
  const router = new TaskRouter([], registry, modelSelector);

  assert.throws(
    () => router.resolveRoute('code_review'),
    (err) => err instanceof RoutingError
  );
});

