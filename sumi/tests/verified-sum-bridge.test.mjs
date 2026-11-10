import test from 'node:test';
import assert from 'node:assert/strict';
import { canonical, makeSigningKey } from '../src/crypto.js';
import { signQuorum } from '../src/secure/signature-quorum.js';
import { createSignedSum, verifySignedSum } from '../src/secure/verified-sum-bridge.js';

const makeRequest=()=>({format:'sumi-sum-request',version:1,purpose:'架空データの合計',requestId:'case-0123456789abcdef',recipient:'検証者A'});
async function fixture(){
  const keys=await Promise.all([makeSigningKey(),makeSigningKey(),makeSigningKey()]);
  const trust={format:'sumi-sum-verifier-trust',version:1,threshold:2,publicKeys:await Promise.all(keys.slice(0,2).map(k=>crypto.subtle.exportKey('jwk',k.publicKey)))};
  const request=makeRequest(),envelope=await createSignedSum([12,18,9,21],request,keys.slice(0,2));
  return {keys,trust,request,envelope};
}

test('実際の合計証明と複数署名を別々に検査し、秘密の数値を同梱しない',async()=>{
  const {trust,request,envelope}=await fixture();
  const result=await verifySignedSum(envelope,request,trust);
  assert.deepEqual({sum:result.sum,count:result.count,signatures:result.verifiedSignatures},{sum:60,count:4,signatures:2});
  assert.equal(Object.hasOwn(envelope.payload.proof,'values'),false);
  assert.equal(Object.isFrozen(result.request),true);
  // Verification is stateless: replays remain valid until the caller manages
  // and atomically consumes the expected request ID outside this API.
  assert.equal((await verifySignedSum(envelope,request,trust)).sum,60);
});
test('条件の差し替え、署名不足・不明鍵・不正な証明と、署名し直した不正な証明を拒否する',async()=>{
  const {keys,trust,request,envelope}=await fixture();
  const changedRequest={...request,recipient:'検証者B'};
  await assert.rejects(verifySignedSum(envelope,changedRequest,trust));
  await assert.rejects(verifySignedSum(envelope,{...request,requestId:'other-0123456789abc'},trust));
  const altered=structuredClone(envelope);altered.payload.proof.sum=61;
  await assert.rejects(verifySignedSum(altered,request,trust));
  // The signers can sign a false claim; the proof still must verify.
  altered.signatures=await signQuorum(new TextEncoder().encode('sumi/verified-sum-bridge/v1\n'+canonical(altered.payload)),keys.slice(0,2));
  await assert.rejects(verifySignedSum(altered,request,trust));
  const missing=structuredClone(envelope);missing.signatures.pop();await assert.rejects(verifySignedSum(missing,request,trust));
  const duplicate=structuredClone(envelope);duplicate.signatures[1]=duplicate.signatures[0];await assert.rejects(verifySignedSum(duplicate,request,trust));
  const untrusted=await createSignedSum([12,18],request,[keys[0],keys[2]]);await assert.rejects(verifySignedSum(untrusted,request,trust));
  const extra=structuredClone(envelope);extra.payload.proof.values=[12,18,9,21];await assert.rejects(verifySignedSum(extra,request,trust));
  const wrongTrust={...trust,format:'sumi-school-policy-trust'};await assert.rejects(verifySignedSum(envelope,request,wrongTrust));
});
test('署名処理中に呼出元が書き換えた依頼や入力を証明に混入させない',async()=>{
  const {keys,trust}=await fixture(),request=makeRequest(),values=[3,5];
  const expected=structuredClone(request),pending=createSignedSum(values,request,keys.slice(0,2));
  values[0]=100;request.recipient='書き換え';
  const signed=await pending,result=await verifySignedSum(signed,expected,trust);
  assert.equal(result.sum,8);await assert.rejects(verifySignedSum(signed,request,trust));
});
