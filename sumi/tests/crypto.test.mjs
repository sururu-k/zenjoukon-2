import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {encryptDraft,decryptDraft,makeSigningKey,signPackage,verifyPackage,keyFingerprint,canonical,DRAFT_FRAME_BYTES} from '../src/crypto.js';
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
test('原文の長さや文字種が違っても、新しい暗号化ファイルは同じ長さになる',async()=>{
  const inputs=[{source:'a'},{source:'秘密の文章'.repeat(8000)},{payload:{protocol:'sumi-mpc-sum-v1',share:'12345'}}];let size;
  for(const input of inputs){const encrypted=await encryptDraft(input,pass);assert.equal(encrypted.version,2);assert.equal(atob(encrypted.ciphertext).length,DRAFT_FRAME_BYTES+16);const length=JSON.stringify(encrypted).length;if(size===undefined)size=length;assert.equal(length,size);assert.deepEqual(await decryptDraft(encrypted,pass),input);}
});
test('固定長フレームのメタデータ改変・切り詰め・容量超過を拒否する',async()=>{
  const encrypted=await encryptDraft({source:'秘密'},pass);
  await assert.rejects(decryptDraft({...encrypted,padding:'none'},pass));
  await assert.rejects(decryptDraft({...encrypted,version:1},pass));
  await assert.rejects(decryptDraft({...encrypted,ciphertext:encrypted.ciphertext.slice(4)},pass));
  await assert.rejects(encryptDraft({source:'x'.repeat(DRAFT_FRAME_BYTES)},pass),/1MiB/);
});
test('公開済みの旧v1形式の下書きも読み込める',async()=>{
  const legacy=JSON.parse(await readFile(new URL('./fixtures/draft-v1.json',import.meta.url),'utf8'));
  assert.equal(legacy.version,1);assert.deepEqual(await decryptDraft(legacy,pass),{source:'旧形式の架空データ',format:'test-fixture'});
});
