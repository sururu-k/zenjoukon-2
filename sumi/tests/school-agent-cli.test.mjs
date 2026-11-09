import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const root=fileURLToPath(new URL('../',import.meta.url));
const run=(action,input='')=>spawnSync(process.execPath,['scripts/school-agent.mjs','examples/gate.txt',action],{cwd:root,input,encoding:'utf8'});
test('実ファイルを確認してからエージェント処理を行い、送信は拒否する',()=>{
  const accepted=run('summarize','yes\n');assert.equal(accepted.status,0,accepted.stderr);assert.match(accepted.stdout,/確認前の判定：拒否/);assert.match(accepted.stdout,/allow \/ 実行結果：denied/);assert.match(accepted.stdout,/allow \/ 実行結果：completed/);assert.match(accepted.stdout,/操作結果：/);assert.match(accepted.stdout,/\[メール非公開\]/);assert.doesNotMatch(accepted.stdout,/sample@example\.test/);
  const denied=run('read','no\n');assert.equal(denied.status,2);assert.doesNotMatch(denied.stdout,/操作結果：/);
  const send=run('send');assert.equal(send.status,2);assert.match(send.stdout,/通信は行っていません/);assert.doesNotMatch(send.stdout,/操作結果：/);
  assert.equal(run('arbitrary').status,1);
});
test('指定された語句も確認前に加工する',()=>{
  const result=spawnSync(process.execPath,['scripts/school-agent.mjs','examples/gate.txt','read','--hide-file','examples/hidden-words.txt'],{cwd:root,input:'yes\n',encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/\[非公開\]/);assert.doesNotMatch(result.stdout,/地域交流会/);
  const bad=spawnSync(process.execPath,['scripts/school-agent.mjs','examples/gate.txt','read','--hide-file'],{cwd:root,input:'yes\n',encoding:'utf8'});assert.equal(bad.status,1);
});
test('学校別の共通設定と追加語句を加工し、不正な設定は拒否する',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'sumi-agent-policy-'));
  try{
    const document=join(dir,'document.txt'),policyFile=join(dir,'policy.json'),hidden=join(dir,'hidden.txt');
    const policy=JSON.parse(await readFile(join(root,'src/school-policy.example.json'),'utf8'));
    policy.documentProof.forbidden=['青空祭'];
    await writeFile(policyFile,JSON.stringify(policy));
    await writeFile(document,'青空祭と秘密企画を準備します。');
    await writeFile(hidden,'秘密企画');
    const run=(...args)=>spawnSync(process.execPath,['scripts/school-agent.mjs',document,'read',...args],{cwd:root,input:'yes\n',encoding:'utf8'});
    const valid=run('--policy',policyFile,'--hide-file',hidden);
    assert.equal(valid.status,0,valid.stderr);
    assert.doesNotMatch(valid.stdout,/青空祭|秘密企画/);
    assert.match(valid.stdout,/\[非公開\]/);
    assert.equal(run('--policy',policyFile,'--policy',policyFile).status,1);
    policy.documentProof.forbidden=['a'.repeat(17)];
    await writeFile(policyFile,JSON.stringify(policy));
    const invalid=run('--policy',policyFile);
    assert.equal(invalid.status,1);
    assert.doesNotMatch(invalid.stdout,/青空祭/);
  }finally{await rm(dir,{recursive:true,force:true});}
});
