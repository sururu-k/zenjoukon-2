import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('ブラウザなしで3製品を動かし、共通ルールで未確認の書き出しを止める', () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const result = spawnSync(process.execPath, ['scripts/products-demo.mjs'], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const demo = JSON.parse(result.stdout);
  assert.equal(demo.prove.verified, true);
  assert.equal(demo.prove.sum, 60);
  for (const product of [demo.write, demo.gate, demo.prove]) {
    assert.equal(product.beforeReview.allow, false);
    assert.equal(product.beforeReview.policyId, demo.commonPolicy);
  }
});
