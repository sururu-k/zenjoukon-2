import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

test('悪意ある回答が合計範囲内に収まる場合の未対応を再現する',()=>{
  const root=fileURLToPath(new URL('../',import.meta.url));
  const result=spawnSync(process.execPath,['scripts/survey-adversary.mjs'],{cwd:root,encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
  assert.match(result.stdout,/数値 2/);
  assert.match(result.stdout,/賛成 2 件、反対 1 件として受理/);
  assert.match(result.stdout,/証明は未実装/);
});
