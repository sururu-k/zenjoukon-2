import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm,stat,symlink,writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
test('出力は指定語と確認した文書・設定・出力名に結び付く',{skip:process.platform==='win32'},async()=>{
  const dir=await mkdtemp(join(tmpdir(),'sumi-release-test-'));
  const workspace=join(dir,'workspace');
  const run=(...args)=>spawnSync(process.execPath,['scripts/school-workspace-release.mjs',...args],{cwd:root,encoding:'utf8'});
  const source=join(workspace,'incoming','document.txt'),output=join(workspace,'output','share.txt');
  try{
    const created=spawnSync(process.execPath,['scripts/school-workspace.mjs','src/school-policy.example.json',workspace],{cwd:root,encoding:'utf8'});
    assert.equal(created.status,0,created.stderr);
    await writeFile(source,'文化祭のお知らせ',{mode:0o600});
    let result=run('release',workspace,'document.txt','share.txt','0'.repeat(64));
    assert.equal(result.status,1);await assert.rejects(stat(output),{code:'ENOENT'});
    result=run('inspect',workspace,'document.txt','share.txt');assert.equal(result.status,0,result.stderr);
    const confirmation=JSON.parse(result.stdout.slice(0,result.stdout.indexOf('\n文書・'))).confirmation;
    await writeFile(source,'内容を変更しました。');
    result=run('release',workspace,'document.txt','share.txt',confirmation);assert.equal(result.status,1);
    await assert.rejects(stat(output),{code:'ENOENT'});
    await writeFile(source,'山田さんのお知らせ');
    result=run('inspect',workspace,'document.txt','share.txt');assert.equal(result.status,1);assert.match(result.stderr,/禁止語/);
    await writeFile(source,'文化祭のお知らせ');
    result=run('release',workspace,'document.txt','other.txt',confirmation);assert.equal(result.status,1);
    const policyFile=join(workspace,'school-policy.json'),previous=await readFile(policyFile);
    await writeFile(policyFile,Buffer.concat([previous,Buffer.from(' ')]));
    result=run('release',workspace,'document.txt','share.txt',confirmation);assert.equal(result.status,1);
    await writeFile(policyFile,previous);
    result=run('release',workspace,'document.txt','share.txt',confirmation);assert.equal(result.status,0,result.stderr);
    assert.equal(await readFile(output,'utf8'),'文化祭のお知らせ');assert.equal((await stat(output)).mode&0o077,0);
    result=run('release',workspace,'document.txt','share.txt',confirmation);assert.equal(result.status,1);
    assert.equal(await readFile(output,'utf8'),'文化祭のお知らせ');
    const link=join(workspace,'incoming','link.txt');await symlink(source,link);
    result=run('inspect',workspace,'link.txt','new.txt');assert.equal(result.status,1);
    result=run('inspect',workspace,'../document.txt','new.txt');assert.equal(result.status,1);
    result=run('inspect',workspace,'document.txt','bad\nname.txt');assert.equal(result.status,1);
  }finally{await rm(dir,{recursive:true,force:true});}
});
