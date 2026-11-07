import test from 'node:test';
import assert from 'node:assert/strict';
import {encryptDraft,decryptDraft,makeSigningKey,signPackage,verifyPackage,keyFingerprint,canonical} from '../src/crypto.js';
const pass='sumi-test-passphrase-2026';
test('暗号化下書きは元の文章を露出せず、復号して復元できる',async()=>{
  const draft={source:'氏名：山田太郎、通学：90分',policy:{age:'decade'}};const a=await encryptDraft(draft,pass),b=await encryptDraft(draft,pass);
  assert.ok(!JSON.stringify(a).includes('山田太郎'));assert.notEqual(a.ciphertext,b.ciphertext);assert.notEqual(a.iv,b.iv);assert.notEqual(a.salt,b.salt);assert.deepEqual(await decryptDraft(a,pass),draft);
});
test('間違ったパスフレーズ・変更された暗号文・不正なKDF設定を拒否する',async()=>{
  const draft=await encryptDraft({source:'秘密の原文'},pass);await assert.rejects(decryptDraft(draft,'wrong-passphrase'),/違うか/);
  const changed=structuredClone(draft);changed.ciphertext=(changed.ciphertext[0]==='A'?'B':'A')+changed.ciphertext.slice(1);await assert.rejects(decryptDraft(changed,pass));
  await assert.rejects(decryptDraft({...draft,iterations:2**31},pass),/対応/);await assert.rejects(encryptDraft({source:'x'},'short'),/12文字/);
});
test('署名検証は整合性と送信者の鍵照合を区別する',async()=>{
  const pair=await makeSigningKey();const payload={format:'sumi-share',version:1,text:'回答者A、通学90分',records:[],policy:{age:'decade'}};
  const envelope=await signPackage(payload,pair);const fp=await keyFingerprint(envelope.publicKey);
  const withoutTrust=await verifyPackage(envelope);assert.equal(withoutTrust.valid,true);assert.equal(withoutTrust.identity,'unconfirmed');
  const trusted=await verifyPackage(envelope,fp);assert.equal(trusted.valid,true);assert.equal(trusted.identity,'matched');
  assert.equal((await verifyPackage(envelope,'0'.repeat(64))).identity,'mismatch');
});
test('文章・加工条件・回答を変更すると署名検証が失敗する',async()=>{
  const pair=await makeSigningKey();const e=await signPackage({format:'sumi-share',version:1,text:'加工済み',policy:{location:'region'},records:[{id:'R01',text:'加工済み'}]},pair);
  for(const change of [x=>x.payload.text='変更した文章',x=>x.payload.policy.location='city',x=>x.payload.records[0].text='変更した回答']){const tampered=structuredClone(e);change(tampered);assert.equal((await verifyPackage(tampered)).valid,false);}
});
test('JSONのプロパティの順序が違っても同じ正規化で検証する',async()=>{
  assert.equal(canonical({b:2,a:[1,'日本語']}),canonical({a:[1,'日本語'],b:2}));
  const e=await signPackage({format:'sumi-share',version:1,text:'日本語'},await makeSigningKey());e.payload={text:e.payload.text,version:1,format:'sumi-share'};assert.equal((await verifyPackage(e)).valid,true);
});
