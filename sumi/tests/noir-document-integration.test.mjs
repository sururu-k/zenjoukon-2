import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

test('指定文書の証明、別コマンドでの検証と開封、条件と文書の差し替えを確認する',{
  skip:!process.env.SUMI_NARGO||!process.env.SUMI_BB,timeout:120000
},async()=>{
  const dir=await mkdtemp(join(tmpdir(),'sumi-document-cli-test-'));
  const root=fileURLToPath(new URL('../',import.meta.url));
  const run=(...args)=>spawnSync(process.execPath,['scripts/noir-document.mjs',...args],{cwd:root,encoding:'utf8',timeout:100000});
  try{
    const doc=join(dir,'doc.txt'),proof=join(dir,'proof.json'),opening=join(dir,'opening.json'),expected=join(dir,'expected.json');
    await writeFile(doc,'文化祭のお知らせ');
    let result=run('prove',doc,'山田',proof,opening);assert.equal(result.status,0,result.stderr);
    const pkg=JSON.parse(await readFile(proof,'utf8'));
    assert.ok(!JSON.stringify(pkg).includes('文化祭'));
    await writeFile(expected,JSON.stringify(pkg.statement));
    result=run('verify',proof,expected);assert.equal(result.status,0,result.stderr);
    result=run('open',doc,opening,expected);assert.equal(result.status,0,result.stderr);
    await writeFile(expected,JSON.stringify({...pkg.statement,forbidden:'佐藤'}));
    result=run('verify',proof,expected);assert.notEqual(result.status,0);assert.match(result.stderr,/期待条件/);
    await writeFile(expected,JSON.stringify(pkg.statement));
    const modified=Buffer.from(pkg.proof,'base64');modified[modified.length-1]^=1;
    const badProof=join(dir,'modified-proof.json');await writeFile(badProof,JSON.stringify({...pkg,proof:modified.toString('base64')}));
    result=run('verify',badProof,expected);assert.ok(Number.isInteger(result.status)&&result.status!==0);assert.equal(result.error,undefined);
    await writeFile(doc,Buffer.concat([Buffer.from('文化祭のお知らせ'),Buffer.from([0])]));
    const openingData=JSON.parse(await readFile(opening,'utf8'));
    await writeFile(opening,JSON.stringify({...openingData,documentLength:pkg.statement.documentLength+1}));
    result=run('open',doc,opening,expected);assert.notEqual(result.status,0);
    await writeFile(doc,'文化祭の山田さん');
    result=run('open',doc,opening,expected);assert.notEqual(result.status,0);
    result=run('prove',doc,'山田',join(dir,'bad.json'),join(dir,'bad-opening.json'));assert.notEqual(result.status,0);assert.match(result.stderr,/禁止語/);
  }finally{await rm(dir,{recursive:true,force:true});}
});
