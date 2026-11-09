import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm,stat,symlink,writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
test('共通設定から作業場所と点検表を作り、既存の場所を変更しない',{skip:process.platform==='win32'},async()=>{
  const dir=await mkdtemp(join(tmpdir(),'sumi-workspace-test-'));
  try{
    const source=join(root,'src/school-policy.example.json'),target=join(dir,'workspace');
    const run=(policy,path)=>spawnSync(process.execPath,['scripts/school-workspace.mjs',policy,path],{cwd:root,encoding:'utf8'});
    let result=run(source,target);assert.equal(result.status,0,result.stderr);
    const policy=JSON.parse(await readFile(join(target,'school-policy.json'),'utf8'));
    assert.deepEqual(policy,JSON.parse(await readFile(source,'utf8')));
    for(const name of ['incoming','reviewed','output'])assert.equal((await stat(join(target,name))).mode&0o077,0);
    for(const name of ['school-policy.json','physical-checklist.txt','README.txt'])assert.equal((await stat(join(target,name))).mode&0o077,0);
    const inspection=spawnSync(process.execPath,['scripts/school-audit.mjs','inspect-path',target],{cwd:root,encoding:'utf8'});
    assert.equal(inspection.status,0,inspection.stderr);assert.equal(JSON.parse(inspection.stdout).result,'basic-mode-ok');
    const checklist=await readFile(join(target,'physical-checklist.txt'),'utf8');
    assert.match(checklist,/紙の書類と端末の施錠保管/);assert.match(checklist,/画面ののぞき見防止/);
    assert.match(await readFile(join(target,'README.txt'),'utf8'),/自動ではありません/);
    await writeFile(join(target,'incoming','keep.txt'),'元の内容');
    result=run(source,target);assert.equal(result.status,1);assert.match(result.stderr,/既に存在/);
    assert.equal(await readFile(join(target,'incoming','keep.txt'),'utf8'),'元の内容');
    const link=join(dir,'existing-link');await symlink(target,link);
    result=run(source,link);assert.equal(result.status,1);
    const invalid=join(dir,'invalid.json'),unused=join(dir,'unused');
    await writeFile(invalid,Buffer.from([0xff]));result=run(invalid,unused);
    assert.equal(result.status,1);assert.match(result.stderr,/UTF-8/);await assert.rejects(stat(unused),{code:'ENOENT'});
  }finally{await rm(dir,{recursive:true,force:true});}
});
