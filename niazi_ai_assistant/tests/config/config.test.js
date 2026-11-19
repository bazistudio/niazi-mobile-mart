import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateProviderConfig,
  validateModelConfig,
  validateRouteRule,
  validateSystemConfig,
  DEFAULT_SYSTEM_CONFIG,
  EnvSecretResolver,
  SecretVault,
} from '../../packages/ai-config/dist/index.js';

test('ai-config: validateProviderConfig validates required fields and types', () => {
  const valid = {
    id: 'test-prov',
    type: 'ollama',
    name: 'Test Ollama',
    baseUrl: 'http://localhost:11434',
    enabled: true,
    timeoutMs: 5000,
    authMethod: 'none',
  };
  assert.equal(validateProviderConfig(valid).valid, true);

  const invalid = {
    id: '',
    type: 'unsupported-provider',
    baseUrl: 'invalid-url',
  };
  const res = validateProviderConfig(invalid);
  assert.equal(res.valid, false);
  assert.ok(res.errors.length >= 3);
});

test('ai-config: validateSystemConfig validates default configuration', () => {
  const res = validateSystemConfig(DEFAULT_SYSTEM_CONFIG);
  assert.equal(res.valid, true);
  assert.equal(res.errors.length, 0);
});

test('ai-config: SecretVault resolves secrets from environment securely', async () => {
  process.env['TEST_AI_KEY'] = 'secret-value-123';
  const vault = SecretVault.getInstance();
  const val = await vault.getSecret('TEST_AI_KEY');
  assert.equal(val, 'secret-value-123');

  const missing = await vault.getSecret('NON_EXISTENT_KEY');
  assert.equal(missing, undefined);
  delete process.env['TEST_AI_KEY'];
});

