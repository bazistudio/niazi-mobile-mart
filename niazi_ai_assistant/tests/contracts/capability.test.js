import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCapabilities } from '../../packages/ai-types/dist/capability.types.js';

test('ai-types: validateCapabilities correctly detects supported and missing capabilities', () => {
  const modelCap = {
    streaming: true,
    toolCalling: false,
    vision: false,
    structuredOutput: true,
    maxContextTokens: 8192,
  };

  const req1 = {
    streamingRequired: true,
    structuredOutputRequired: true,
    minContextTokens: 4096,
  };
  const res1 = validateCapabilities(modelCap, req1);
  assert.equal(res1.satisfied, true);
  assert.equal(res1.missing.length, 0);

  const req2 = {
    streamingRequired: true,
    toolCallingRequired: true,
    minContextTokens: 16384,
  };
  const res2 = validateCapabilities(modelCap, req2);
  assert.equal(res2.satisfied, false);
  assert.equal(res2.missing.length, 2);
  assert.ok(res2.missing.includes('toolCalling'));
});

