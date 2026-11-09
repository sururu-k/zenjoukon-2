import test from 'node:test';
import assert from 'node:assert/strict';
import {startDocumentServer} from '../document-live/server.mjs';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

test('ローカル画面以外のオリジンと公開対象外のファイルを拒否する',async()=>{
  const server=await startDocumentServer(0),base=`http://127.0.0.1:${server.address().port}`;
  try{
    assert.equal((await fetch(base+'/')).status,200);
    assert.equal((await fetch(base+'/server.mjs')).status,404);
    const cross=await fetch(base+'/api/prove',{method:'POST',headers:{origin:'https://example.test','content-type':'application/json'},body:'{}'});
    assert.equal(cross.status,403);
    const invalid=await fetch(base+'/api/prove',{method:'POST',headers:{origin:base,'content-type':'application/json'},body:'{'});
    assert.equal(invalid.status,400);
    const malformed=Buffer.concat([Buffer.from('{"text":"'),Buffer.from([0xff]),Buffer.from('","terms":["山田"]}')]);
    const invalidUtf8=await fetch(base+'/api/prove',{method:'POST',headers:{origin:base,'content-type':'application/json'},body:malformed});
    assert.equal(invalidUtf8.status,400);
    assert.match((await invalidUtf8.json()).error,/UTF-8/);
  }finally{server.close();}
});

test('端末の文書証明は不正なUTF-8のJSONを拒否する',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'sumi-json-utf8-'));
  try{
    const json=join(dir,'invalid.json');
    await writeFile(json,Buffer.concat([Buffer.from('{"salt":"'),Buffer.from([0xff]),Buffer.from('"}')]));
    const root=fileURLToPath(new URL('../',import.meta.url));
    const result=spawnSync(process.execPath,['scripts/noir-document-v2.mjs','open','unused.txt',json,'unused.json'],{cwd:root,encoding:'utf8'});
    assert.equal(result.status,1);
    assert.match(result.stderr,/UTF-8/);
  }finally{await rm(dir,{recursive:true,force:true});}
});

test('画面のAPIから実際に証明を作り、独立した期待条件で検証する',{
  skip:!process.env.SUMI_NARGO||!process.env.SUMI_BB,timeout:120000
},async()=>{
  const server=await startDocumentServer(0),base=`http://127.0.0.1:${server.address().port}`;
  const post=(path,body)=>fetch(base+path,{method:'POST',headers:{origin:base,'content-type':'application/json'},body:JSON.stringify(body)});
  try{
    let response=await post('/api/prove',{text:'文化祭のお知らせ',terms:['山田','佐藤']});
    assert.equal(response.status,200);const result=await response.json();
    assert.equal(result.proof.format,'sumi-document-proof-v2');assert.ok(!JSON.stringify(result.proof).includes('文化祭'));
    response=await post('/api/verify',{proof:result.proof,expected:result.proof.statement});
    assert.equal(response.status,200);assert.equal((await response.json()).verified,true);
    response=await post('/api/verify',{proof:result.proof,expected:{...result.proof.statement,forbidden:['別の条件']}});
    assert.equal(response.status,400);
    response=await post('/api/prove',{text:'山田さんに連絡',terms:['山田']});assert.equal(response.status,400);
  }finally{server.close();}
});
