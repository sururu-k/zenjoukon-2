import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const run=(action,input='')=>spawnSync(process.execPath,['scripts/school-agent.mjs','examples/gate.txt',action],{cwd:root,input,encoding:'utf8'});
test('実ファイルを確認してからエージェント処理を行い、送信は拒否する',()=>{
  const accepted=run('summarize','yes\n');assert.equal(accepted.status,0,accepted.stderr);assert.match(accepted.stdout,/確認前の判定：拒否/);assert.match(accepted.stdout,/allow \/ 実行結果：denied/);assert.match(accepted.stdout,/allow \/ 実行結果：completed/);assert.match(accepted.stdout,/操作結果：/);assert.match(accepted.stdout,/\[メール非公開\]/);assert.doesNotMatch(accepted.stdout,/sample@example\.test/);
  const denied=run('read','no\n');assert.equal(denied.status,2);assert.doesNotMatch(denied.stdout,/操作結果：/);
  const send=run('send');assert.equal(send.status,2);assert.match(send.stdout,/通信は行っていません/);assert.doesNotMatch(send.stdout,/操作結果：/);
  assert.equal(run('arbitrary').status,1);
});
