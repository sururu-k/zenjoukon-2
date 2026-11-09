import test from 'node:test';
import assert from 'node:assert/strict';
import {startDocumentServer} from '../document-live/server.mjs';

test('ローカル画面以外のオリジンと公開対象外のファイルを拒否する',async()=>{
  const server=await startDocumentServer(0),base=`http://127.0.0.1:${server.address().port}`;
  try{
    assert.equal((await fetch(base+'/')).status,200);
    assert.equal((await fetch(base+'/server.mjs')).status,404);
    const cross=await fetch(base+'/api/prove',{method:'POST',headers:{origin:'https://example.test','content-type':'application/json'},body:'{}'});
    assert.equal(cross.status,403);
    const invalid=await fetch(base+'/api/prove',{method:'POST',headers:{origin:base,'content-type':'application/json'},body:'{'});
    assert.equal(invalid.status,400);
  }finally{server.close();}
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
