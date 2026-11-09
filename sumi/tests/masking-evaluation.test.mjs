import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('架空の評価を再現し、検出できない例も隠さず表示する',()=>{
  const root=fileURLToPath(new URL('../',import.meta.url));
  const r=spawnSync(process.execPath,['scripts/evaluate-masking.mjs'],{cwd:root,encoding:'utf8'});
  assert.equal(r.status,0,r.stderr);const report=JSON.parse(r.stdout);
  assert.equal(report.sensitive.total,12);assert.equal(report.specified.total,2);assert.equal(report.controls.total,3);
  assert.equal(report.cases.find(c=>c.id==='email_ascii').passed,true);
  assert.equal(report.cases.find(c=>c.id==='phone_fullwidth').passed,true);
  assert.equal(typeof report.cases.find(c=>c.id==='health_unlabeled').passed,'boolean');
  assert.ok(!r.stdout.includes('alice@example.test'));
});
