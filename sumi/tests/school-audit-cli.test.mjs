import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
test('端末から設定案と物理チェックを生成し、未確認がある結果を非適合として返す',()=>{
  const draft=spawnSync(process.execPath,['scripts/school-audit.mjs','draft'],{cwd:root,encoding:'utf8'});assert.equal(draft.status,0);assert.equal(JSON.parse(draft.stdout).applied,false);
  const report=spawnSync(process.execPath,['scripts/school-audit.mjs','check','school-backend/observations.example.json'],{cwd:root,encoding:'utf8'});assert.equal(report.status,2);assert.equal(JSON.parse(report.stdout).evidence,'self-reported');
  const missing=spawnSync(process.execPath,['scripts/school-audit.mjs','check','missing.json'],{cwd:root,encoding:'utf8'});assert.equal(missing.status,1);
});
