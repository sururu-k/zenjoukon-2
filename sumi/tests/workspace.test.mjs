import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkspace } from '../src/workspace.js';
import { createLocalAITransport } from '../src/browser-effects.js';
import { PRESETS } from '../src/privacy.js';
import { decryptDraft, verifyPackage, hash } from '../src/crypto.js';

function setup(){
  const calls={copies:[],downloads:[],audit:[]};
  const w=createWorkspace({copy:async text=>calls.copies.push(text),download:async(name,data)=>calls.downloads.push({name,data}),audit:e=>calls.audit.push(e)});
  w.setDocument({text:'回答者A、通学：90分',kept:0},PRESETS.public);
  return {w,calls};
}
const denied=(promise,code)=>assert.rejects(promise,e=>e.name==='AuthorizationError'&&(!code||e.code===code));

test('未登録の経路と確認前の実行は、画面を経由しなくても拒否する',async()=>{
  const {w,calls}=setup();await denied(w.copy());w.setDestination('clipboard');await denied(w.copy({reviewed:true}),'review-required');await denied(w.export(),'destination');assert.equal(calls.copies.length,0);assert.equal(calls.downloads.length,0);
  assert.throws(()=>{w.reviewed=true;},TypeError);assert.throws(()=>{w.destination='share-file';},TypeError);
});
test('確認した経路だけを許可し、出力先を変えると確認が失効する',async()=>{
  const {w,calls}=setup();w.setDestination('clipboard');await w.approve();await w.copy();assert.deepEqual(calls.copies,['回答者A、通学：90分']);await denied(w.export(),'destination');w.setDestination('share-file');assert.equal(w.reviewed,false);await denied(w.export(),'review-required');
});
test('文書や加工条件を変えたら、同じ文章に見えても承認を再利用しない',async()=>{
  const {w,calls}=setup();w.setDestination('clipboard');await w.approve();w.setDocument({text:'別の文章',kept:0},PRESETS.public);await denied(w.copy(),'review-required');await w.approve();w.setDocument({text:'別の文章',kept:0},PRESETS.students);await denied(w.copy(),'classification');assert.equal(calls.copies.length,0);
});
test('呼び出し元のオブジェクトを後から書き換えても、承認済み本文は差し替わらない',async()=>{
  const {w,calls}=setup();const result={text:'確認した版',kept:0},policy={...PRESETS.public};w.setDocument(result,policy);w.setDestination('clipboard');await w.approve();result.text='未確認の差し替え';policy.age='exact';await w.copy();assert.deepEqual(calls.copies,['確認した版']);
});
test('確認用ハッシュの計算中に変更された版を承認しない',async()=>{
  const {w}=setup();w.setDestination('clipboard');const pending=w.approve();w.setDocument({text:'変更後',kept:0},PRESETS.public);await denied(pending,'stale');assert.equal(w.reviewed,false);
  const next=w.approve();w.revokeReview();await denied(next,'stale');assert.equal(w.reviewed,false);
});
test('署名中に文書・保存先・確認状態が変わったら、保存APIを呼ばない',async()=>{
  for(const mutate of [w=>w.clear(),w=>w.setDestination('clipboard'),w=>w.revokeReview()]){
    const {w,calls}=setup();w.setDestination('share-file');await w.approve();const pending=w.export();mutate(w);await denied(pending,'stale');assert.equal(calls.downloads.length,0);
  }
});
test('共有ファイルには実際に承認した版・出力先・ルール版が署名される',async()=>{
  const {w,calls}=setup();w.setDestination('share-file');await w.approve();const receipt=await w.export();const saved=calls.downloads[0].data;assert.equal((await verifyPackage(saved,receipt.fingerprint)).identity,'matched');assert.equal(saved.payload.authorization.destination,'share-file');assert.equal(saved.payload.authorization.policyId,'sumi-egress-v1');assert.equal(saved.payload.authorization.documentHash,await hash(saved.payload.text));assert.ok(!JSON.stringify(saved).includes('privateKey'));assert.ok(!JSON.stringify(saved).includes('source'));
});
test('原文を残した加工版は、確認だけでは平文出力を許可しない',async()=>{
  const {w,calls}=setup();w.setDocument({text:'山田太郎',kept:1},PRESETS.public);w.setDestination('clipboard');await w.approve();await denied(w.copy(),'classification');assert.equal(calls.copies.length,0);
});
test('原文を含む下書きは暗号化し、保存中に変更された版は拒否する',async()=>{
  const {w,calls}=setup(),draft={source:'秘密の原文'};await w.saveDraft(draft,'long-passphrase-2026');const envelope=calls.downloads[0].data;assert.equal(envelope.format,'sumi-encrypted-draft');assert.deepEqual(await decryptDraft(envelope,'long-passphrase-2026'),draft);assert.ok(!JSON.stringify(envelope).includes('秘密の原文'));
  const pending=w.saveDraft(draft,'long-passphrase-2026');w.clear();await denied(pending,'stale');assert.equal(calls.downloads.length,1);
});
test('AIへのI/Oも同意・端末内の接続先・現在の版を必要とする',async t=>{
  const {w}=setup();const calls=[];t.mock.method(globalThis,'fetch',async(url,options)=>{calls.push({url,options});return {ok:true,json:async()=>({models:[]})};});
  const ai=createLocalAITransport(w);
  await denied(ai.request('http://127.0.0.1:11434','/api/tags',undefined,{consented:false}),'local-consent');
  await assert.rejects(ai.request('https://evil.test','/api/generate',{prompt:'原文'},{consented:true}));
  await denied(ai.request('http://127.0.0.1:11434','/other',undefined,{consented:true}),'destination');
  const old=w.revision;w.clear();await denied(ai.request('http://127.0.0.1:11434','/api/generate',{prompt:'原文'},{consented:true,expectedRevision:old}),'stale');assert.equal(calls.length,0);
  await ai.request('http://127.0.0.1:11434','/api/tags',undefined,{consented:true});assert.equal(calls.length,1);assert.equal(calls[0].options.redirect,'error');assert.equal(calls[0].options.credentials,'omit');
});
