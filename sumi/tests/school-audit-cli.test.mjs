import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
test('端末から設定案と物理チェックを生成し、未確認がある結果を非適合として返す',()=>{
  const draft=spawnSync(process.execPath,['scripts/school-audit.mjs','draft'],{cwd:root,encoding:'utf8'});assert.equal(draft.status,0);assert.equal(JSON.parse(draft.stdout).applied,false);
  const report=spawnSync(process.execPath,['scripts/school-audit.mjs','check','school-backend/observations.example.json'],{cwd:root,encoding:'utf8'});assert.equal(report.status,2);assert.equal(JSON.parse(report.stdout).evidence,'self-reported');
  const missing=spawnSync(process.execPath,['scripts/school-audit.mjs','check','missing.json'],{cwd:root,encoding:'utf8'});assert.equal(missing.status,1);
});
test('対話式点検は理由を示し、未確認を適合としない',()=>{
  const run=(input)=>spawnSync(process.execPath,['scripts/school-audit.mjs','guide'],{cwd:root,encoding:'utf8',input});
  const partial=run('y\nn\n?\ny\ny\n');assert.equal(partial.status,2);assert.match(partial.stdout,/理由：/);assert.match(partial.stdout,/未対応：担当者ごとのアクセス制限/);assert.match(partial.stdout,/未確認：暗号化したバックアップ/);assert.match(partial.stdout,/自己申告/);
  const complete=run('y\ny\ny\ny\ny\n');assert.equal(complete.status,0);assert.match(complete.stdout,/実環境の証明ではありません/);
  const stopped=run('y\n');assert.equal(stopped.status,1);assert.match(stopped.stderr,/入力が終了/);
  const invalid=run('x\ny\ny\ny\ny\ny\n');assert.equal(invalid.status,0);assert.match(invalid.stdout,/いずれかを入力/);
});
test('自動実演は未確認と権限を点検し、一時ファイルを残さない', {skip:process.platform==='win32'}, async()=>{
  const temp=await mkdtemp(join(tmpdir(),'sumi-demo-test-'));
  try{
    const demo=spawnSync(process.execPath,['scripts/school-audit-demo.mjs'],{
      cwd:root,encoding:'utf8',env:{...process.env,TMPDIR:temp},timeout:30000
    });
    assert.equal(demo.status,0,demo.stderr);
    assert.match(demo.stdout,/暗号化したバックアップを担当者に確認/);
    assert.match(demo.stdout,/保存先の所有者とアクセス権を管理者に確認/);
    assert.match(demo.stdout,/自己申告の未確認・未対応は残ります/);
    assert.deepEqual(await readdir(temp),[]);
  }finally{await rm(temp,{recursive:true,force:true});}
});
