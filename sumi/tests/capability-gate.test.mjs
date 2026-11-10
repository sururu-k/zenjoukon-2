import test from 'node:test';
import assert from 'node:assert/strict';
import { makeSigningKey } from '../src/crypto.js';
import { signCapabilityOrder, createCapabilityGate } from '../src/secure/capability-gate.js';

async function setup() {
  const keys = await Promise.all([makeSigningKey(),makeSigningKey()]);
  const trust = {format:'sumi-capability-order-trust',version:1,threshold:2,publicKeys:await Promise.all(keys.map(k=>crypto.subtle.exportKey('jwk',k.publicKey)))};
  const order = {format:'sumi-capability-order',version:1,orderId:'order-1',gateId:'school-gate',action:'release',resource:'notice',maxQuantity:1,expiresAt:200};
  const signed = await signCapabilityOrder(order,keys), calls=[];
  const gate = createCapabilityGate({gateId:'school-gate',trust,now:()=>100,execute:async action=>{calls.push(action);return 'executed';}});
  return {keys,trust,order,signed,calls,gate};
}
test('trusted order authorizes only its specific action and is consumed',async()=>{
  const f=await setup(), action={action:'release',resource:'notice',quantity:1};
  assert.equal(await f.gate.run(f.signed,action),'executed');
  await assert.rejects(f.gate.run(f.signed,action));
  assert.equal(f.calls.length,1);
});
test('injected action, wrong resource, altered order and insufficient signatures fail closed',async()=>{
  const f=await setup(), action={action:'release',resource:'notice',quantity:1};
  await assert.rejects(f.gate.run(f.signed,{...action,quantity:2}));
  await assert.rejects(f.gate.run(f.signed,{...action,resource:'private'}));
  await assert.rejects(f.gate.run(f.signed,{...action,action:'delete'}));
  const changed=structuredClone(f.signed);changed.order.maxQuantity=100;
  await assert.rejects(f.gate.run(changed,action));
  const one=structuredClone(f.signed);one.signatures.pop();
  await assert.rejects(f.gate.run(one,action));
  assert.equal(f.calls.length,0);
});
test('expiry, wrong gate and concurrent replay cannot execute',async()=>{
  const f=await setup(), action={action:'release',resource:'notice',quantity:1};
  const expired=createCapabilityGate({gateId:'school-gate',trust:f.trust,now:()=>200,execute:()=>{throw Error('unexpected');}});
  await assert.rejects(expired.run(f.signed,action));
  const wrong=createCapabilityGate({gateId:'warehouse',trust:f.trust,now:()=>100,execute:()=>{throw Error('unexpected');}});
  await assert.rejects(wrong.run(f.signed,action));
  const results=await Promise.allSettled([f.gate.run(f.signed,action),f.gate.run(f.signed,action)]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(f.calls.length,1);
});
