import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm,stat,writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateSchoolPolicy} from '../src/school-policy-contract.js';

const root=fileURLToPath(new URL('../',import.meta.url));
test('対話から共通設定を生成し、点検とエージェントで使える',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'sumi-policy-create-'));
  const policy=join(dir,'school.json'), document=join(dir,'document.txt');
  const run=(args,input='')=>spawnSync(process.execPath,args,{cwd:root,input,encoding:'utf8'});
  try{
    let result=run(['scripts/school-policy-create.mjs',policy],'架空の学校\n青空祭、山田\n');
    assert.equal(result.status,0,result.stderr);
    const created=validateSchoolPolicy(JSON.parse(await readFile(policy,'utf8')));
    assert.equal(created.school,'架空の学校');assert.deepEqual(created.documentProof.forbidden,['青空祭','山田']);
    if(process.platform!=='win32')assert.equal((await stat(policy)).mode&0o077,0);
    result=run(['scripts/school-audit.mjs','--policy',policy,'draft']);
    assert.equal(result.status,0,result.stderr);assert.equal(JSON.parse(result.stdout).applied,false);
    await writeFile(document,'青空祭は山田が担当します。');
    result=run(['scripts/school-agent.mjs',document,'read','--policy',policy],'yes\n');
    assert.equal(result.status,0,result.stderr);assert.doesNotMatch(result.stdout,/青空祭|山田/);
    const previous=await readFile(policy,'utf8');
    result=run(['scripts/school-policy-create.mjs',policy],'別の学校\n佐藤\n');
    assert.equal(result.status,1);assert.match(result.stderr,/既に存在/);assert.equal(await readFile(policy,'utf8'),previous);
    for(const input of ['学校\n\n','学校\n山田、山田\n','学校\n長'.concat('長'.repeat(5),'\n'),'学校\n']){
      const bad=join(dir,'invalid.json');result=run(['scripts/school-policy-create.mjs',bad],input);
      assert.equal(result.status,1);await assert.rejects(stat(bad),{code:'ENOENT'});
    }
  }finally{await rm(dir,{recursive:true,force:true});}
});
