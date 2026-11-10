import assert from 'node:assert/strict';
import { makeSigningKey } from '../src/crypto.js';
import { createSignedSum, verifySignedSum } from '../src/secure/verified-sum-bridge.js';

// Fictional data only. The verifier's request and trusted keys are separate
// from the received envelope. No files or network connections are used.
const pairs=await Promise.all([makeSigningKey(),makeSigningKey()]);
const trust={format:'sumi-sum-verifier-trust',version:1,threshold:2,publicKeys:await Promise.all(pairs.map(k=>crypto.subtle.exportKey('jwk',k.publicKey)))};
for(const [purpose,values,requestId] of [
  ['地域拠点の参加人数',[12,18,9,21],'community-demo-2026'],
  ['架空学校の班ごとの人数',[10,8,6],'school-demo-2026-01'],
]){
  const request={format:'sumi-sum-request',version:1,purpose,requestId,recipient:'別経路で確認した検証者'};
  const envelope=await createSignedSum(values,request,pairs);
  const result=await verifySignedSum(envelope,request,trust);
  assert.equal(result.sum,values.reduce((a,b)=>a+b,0));
  assert.equal(Object.hasOwn(envelope.payload.proof,'values'),false);
  console.log(`${purpose}：${result.count}件の合計 ${result.sum}、証明と${result.verifiedSignatures}鍵の署名を検証。`);
  const changed=structuredClone(envelope);changed.payload.proof.sum++;
  await assert.rejects(verifySignedSum(changed,request,trust));
  await assert.rejects(verifySignedSum(envelope,{...request,recipient:'異なる検証者'},trust));
  console.log('  合計の改変と、別の依頼先への差し替えを拒否。');
}
console.log('公開内容は用途・依頼ID・受取先・件数・合計・コミットメント・証明・署名です。');
console.log('入力の真実性や範囲は証明せず、鍵の所有者の確認、依頼IDの使い捨て管理、失効は別途必要です。');
