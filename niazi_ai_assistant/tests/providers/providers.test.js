import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ProviderRegistry,
  ProviderFactory,
  OllamaMapper,
  OpenAICompatibleMapper,
  AIProviderError,
} from '../../packages/ai-providers/dist/index.js';

test('ai-providers: ProviderRegistry manages registration and rejects duplicate IDs', () => {
  const registry = ProviderRegistry.getInstance();
  registry.clear();

  const dummyProvider = {
    id: 'prov-1',
    name: 'Provider One',
    type: 'ollama',
    testConnection: async () => ({ success: true, latencyMs: 10 }),
    listModels: async () => [],
    generate: async () => { throw new Error('Not implemented'); },
    stream: async function* () {},
  };

  registry.register(dummyProvider);
  assert.equal(registry.get('prov-1')?.id, 'prov-1');

  // Duplicate ID must throw
  assert.throws(
    () => registry.register(dummyProvider),
    (err) => err instanceof AIProviderError && err.code === 'PROVIDER_INTERNAL'
  );

  // Toggle enabled
  registry.setEnabled('prov-1', false);
  assert.equal(registry.get('prov-1'), undefined); // Disabled provider returns undefined

  registry.setEnabled('prov-1', true);
  assert.equal(registry.get('prov-1')?.id, 'prov-1');
  registry.clear();
});

test('ai-providers: OllamaMapper transforms chat completions correctly', () => {
  const rawResponse = {
    model: 'llama3.2:latest',
    created_at: '2026-11-11T12:00:00Z',
    message: {
      role: 'assistant',
      content: 'Hello, I am Niazi AI Assistant.',
    },
    done: true,
    done_reason: 'stop',
    prompt_eval_count: 15,
    eval_count: 8,
  };

  const mapped = OllamaMapper.mapResponse(rawResponse, 'ollama-local', 'llama3.2:latest');
  assert.equal(mapped.content, 'Hello, I am Niazi AI Assistant.');
  assert.equal(mapped.modelId, 'llama3.2:latest');
  assert.equal(mapped.providerId, 'ollama-local');
  assert.equal(mapped.finishReason, 'stop');
  assert.equal(mapped.usage?.totalTokens, 23);
});

test('ai-providers: OpenAICompatibleMapper transforms requests and responses correctly', () => {
  const req = {
    modelId: 'gpt-3.5-turbo',
    messages: [
      { role: 'user', content: 'Say hello' },
    ],
    temperature: 0.7,
  };

  const payload = OpenAICompatibleMapper.mapRequest(req);
  assert.equal(payload.model, 'gpt-3.5-turbo');
  assert.equal(payload.temperature, 0.7);
  assert.equal(Array.isArray(payload.messages), true);

  const rawChoice = {
    id: 'chatcmpl-123',
    object: 'chat.completion',
    created: 1700000000,
    model: 'gpt-3.5-turbo',
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content: 'Hello from OpenAI compatible endpoint',
        },
        finish_reason: 'stop',
      },
    ],
    usage: {
      prompt_tokens: 10,
      completion_tokens: 6,
      total_tokens: 16,
    },
  };

  const res = OpenAICompatibleMapper.mapResponse(rawChoice, 'custom-gateway', 'gpt-3.5-turbo');
  assert.equal(res.content, 'Hello from OpenAI compatible endpoint');
  assert.equal(res.finishReason, 'stop');
  assert.equal(res.usage?.totalTokens, 16);
});

test('ai-providers: ProviderFactory guards unsupported future providers', () => {
  assert.throws(
    () => ProviderFactory.create({
      id: 'claude-prov',
      type: 'anthropic',
      name: 'Claude',
      baseUrl: 'https://api.anthropic.com',
      enabled: true,
      timeoutMs: 30000,
      authMethod: 'bearer',
    }),
    (err) => err instanceof AIProviderError && err.code === 'UNSUPPORTED_CAPABILITY'
  );
});

