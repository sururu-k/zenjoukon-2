import assert from 'node:assert/strict';
import { makeSigningKey } from '../src/crypto.js';
import { createSignedSum, verifySignedSum, createSumVerifierSession } from '../src/secure/verified-sum-bridge.js';

// Fictional data only. The verifier's request and trusted keys are separate
// from the received envelope. No files or network connections are used.
const pairs=await Promise.all([makeSigningKey(),makeSigningKey()]);
const trust={format:'sumi-sum-verifier-trust',version:1,threshold:2,publicKeys:await Promise.all(pairs.map(k=>crypto.subtle.exportKey('jwk',k.publicKey)))};
const verifier=createSumVerifierSession(trust);
for(const [purpose,values] of [
  ['地域拠点の参加人数',[12,18,9,21]],
  ['架空学校の班ごとの人数',[10,8,6]],
]){
  const request=verifier.issue(purpose,'別経路で確認した検証者');
  const envelope=await createSignedSum(values,request,pairs);
  const changed=structuredClone(envelope);changed.payload.proof.sum++;
  await assert.rejects(verifier.verifyAndConsume(changed,request.requestId));
  await assert.rejects(verifySignedSum(envelope,{...request,recipient:'異なる検証者'},trust));
  const result=await verifier.verifyAndConsume(envelope,request.requestId);
  assert.equal(result.sum,values.reduce((a,b)=>a+b,0));
  assert.equal(Object.hasOwn(envelope.payload.proof,'values'),false);
  await assert.rejects(verifier.verifyAndConsume(envelope,request.requestId));
  console.log(`${purpose}：${result.count}件の合計 ${result.sum}、証明と${result.verifiedSignatures}鍵の署名を検証。`);
  console.log('  合計の改変、別の依頼先への差し替え、同じ依頼の再利用を拒否。');
}
console.log('公開内容は用途・依頼ID・受取先・件数・合計・コミットメント・証明・署名です。');
console.log('再利用の拒否は同じ検証セッション内のみ。再起動・複数端末にまたがる管理はありません。');
console.log('入力の真実性や範囲は証明せず、鍵の所有者の確認や失効は別途必要です。');
