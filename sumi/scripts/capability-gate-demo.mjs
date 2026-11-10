import { makeSigningKey } from '../src/crypto.js';
import { signCapabilityOrder, createCapabilityGate } from '../src/secure/capability-gate.js';

const keys=await Promise.all([makeSigningKey(),makeSigningKey()]);
const trust={format:'sumi-capability-order-trust',version:1,threshold:2,publicKeys:await Promise.all(keys.map(k=>crypto.subtle.exportKey('jwk',k.publicKey)))};
async function example(gateId,action,resource) {
  const order={format:'sumi-capability-order',version:1,orderId:`${gateId}-order`,gateId,action,resource,maxQuantity:1,expiresAt:Date.now()+60000};
  const signed=await signCapabilityOrder(order,keys);
  const gate=createCapabilityGate({gateId,trust,execute:async a=>`実行: ${a.action} ${a.resource} × ${a.quantity}`});
  try { await gate.run(signed,{action,resource,quantity:10}); throw Error('上限違反を拒否できませんでした'); }
  catch (error) { if(error.message.startsWith('上限違反を')) throw error; console.log(`${gateId}: 上限を超えた提案を拒否`); }
  console.log(`${gateId}: ${await gate.run(signed,{action,resource,quantity:1})}`);
  try { await gate.run(signed,{action,resource,quantity:1}); throw Error('再利用を拒否できませんでした'); }
  catch (error) { if(error.message.startsWith('再利用を')) throw error; console.log(`${gateId}: 同じ注文の再利用を拒否`); }
}
await example('school-gate','release','notice');
await example('warehouse-gate','pick','item');
console.log('架空の注文と模擬実行です。ZK証明や物理的な安全の保証ではありません。');
