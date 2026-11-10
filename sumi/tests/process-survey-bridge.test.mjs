import test from 'node:test';
import assert from 'node:assert/strict';
import { runProcessSurvey } from '../scripts/process-survey-bridge.mjs';
import { startCollector } from '../survey-live/server.mjs';

test('separate collectors sign and verify a fictional survey', async () => {
  const result = await runProcessSurvey('test_process_survey', [true, false, true]);
  assert.equal(result.count, 3);
  assert.equal(result.yes, 2);
  assert.equal(result.no, 1);
  assert.notEqual(result.pids[0], result.pids[1]);
  assert.deepEqual(result.heldStatuses, [404, 404]);
});

test('rejects malformed survey inputs before starting workers', async () => {
  await assert.rejects(runProcessSurvey('bad', [true, false, true]));
  await assert.rejects(runProcessSurvey('valid_campaign', [true, 'false', true]));
});

test('publish credentials cannot be configured on an unencrypted collector', async () => {
  await assert.rejects(startCollector('A', 0, { campaign: 'test_campaign', publishToken: 'a'.repeat(64) }));
  await assert.rejects(startCollector('A', 0, { campaign: 'test_campaign', publishToken: 'short', tls: {} }));
});
