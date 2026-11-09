import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('架空データの自動デモは作成・加工・証明・エージェント制御を最後まで実行する',()=>{
  const root=fileURLToPath(new URL('../',import.meta.url));
  const result=spawnSync(process.execPath,['scripts/automatic-demo.mjs'],{cwd:root,encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
  for(const expected of ['【見えないアンケート】','回答２件：集計を表示しない','【Write】','【Gate】','【Prove】','【Agent】','確認前の書き出し：拒否','合計を61に変更：検証失敗','外部送信の提案：拒否','文書変更後の要約：再確認まで拒否'])assert.ok(result.stdout.includes(expected),expected);
});
