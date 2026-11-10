import test from 'node:test';
import assert from 'node:assert/strict';
import { makeSigningKey } from '../src/crypto.js';
import { createSignedSum } from '../src/secure/verified-sum-bridge.js';
import { createAgentVerifiedTool } from '../src/secure/agent-verified-tool.js';

async function fixture(transportFactory) {
  const keys = await Promise.all([makeSigningKey(), makeSigningKey()]);
  const trust = {format:'sumi-sum-verifier-trust',version:1,threshold:2,publicKeys:await Promise.all(keys.map(k=>crypto.subtle.exportKey('jwk',k.publicKey)))};
  let calls=0;
  const make = async (call, values=[3,4,5]) => {const evidence=await createSignedSum(values,call.request,keys);return {result:{sum:evidence.payload.proof.sum,count:evidence.payload.proof.count},evidence};};
  const transport=transportFactory ? transportFactory(make) : make;
  const owner=createAgentVerifiedTool({trust,recipient:'agent-verifier',datasets:['school','community'],transport:async call=>{calls++;return transport(call);}});
  return {owner,get calls(){return calls;}};
}

test('owner approval, proof and minimum count are required before agent receives a sum', async () => {
  const f=await fixture();
  assert.equal((await f.owner.agent.run({datasetId:'school',revision:0})).status,'denied');
  assert.equal(f.calls,0);
  f.owner.approve('school',0);
  assert.equal((await f.owner.agent.run({datasetId:'community',revision:0})).status,'denied');
  assert.deepEqual(await f.owner.agent.run({datasetId:'school',revision:0}),{status:'completed',datasetId:'school',sum:12,count:3,verifiedSignatures:2});
  assert.equal((await f.owner.agent.run({datasetId:'school',revision:0})).status,'denied');
  assert.equal(f.calls,1);
});

test('a forged result and a valid proof below the minimum never reach the agent', async () => {
  const forged=await fixture(make=>async call=>{const r=await make(call);r.result.sum++;return r;});
  forged.owner.approve('community',0);
  const r=await forged.owner.agent.run({datasetId:'community',revision:0});
  assert.equal(r.status,'denied'); assert.equal(Object.hasOwn(r,'sum'),false);
  const small=await fixture(make=>call=>make(call,[1,2]));
  small.owner.approve('school',0);
  const s=await small.owner.agent.run({datasetId:'school',revision:0});
  assert.equal(s.status,'denied'); assert.equal(Object.hasOwn(s,'sum'),false);
});

test('invalidation during an outstanding tool call and concurrent reuse fail closed', async () => {
  let release, arrived;
  const waiting=new Promise(resolve=>{arrived=resolve;});
  const f=await fixture(make=>async call=>{arrived();await new Promise(resolve=>{release=resolve;});return make(call);});
  f.owner.approve('school',0);
  const pending=f.owner.agent.run({datasetId:'school',revision:0});
  await waiting;
  assert.equal((await f.owner.agent.run({datasetId:'school',revision:0})).status,'denied');
  f.owner.invalidate(); release();
  const r=await pending;
  assert.equal(r.status,'denied'); assert.equal(Object.hasOwn(r,'sum'),false);
  assert.equal(f.calls,1);
});
