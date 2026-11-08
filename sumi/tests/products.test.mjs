import test from 'node:test';
import assert from 'node:assert/strict';
import { composeDocument, writerAIRequest, validateWriterProposal, prepareDocument, restoreWriterDraft } from '../src/document-workflow.js';
import { defaultProofPlan, validateProofPlan, proofAIRequest } from '../src/proof-planner.js';
import { createLocalAssistant } from '../src/local-assistant.js';
import { createWorkspace } from '../src/workspace.js';
import { proveCommittedSum, verifyCommittedSum } from '../src/secure/zk.js';
import { decryptDraft } from '../src/crypto.js';
const materials={title:'地域交流会の報告',kind:'report',facts:'40名が参加した。担当者：山田太郎、メール：taro@example.test\n次回は未発表企画ALPHAを検討する。'};
const setup=()=>{const saved=[],copied=[];return {saved,copied,w:createWorkspace({download:async(name,data)=>saved.push({name,data}),copy:async text=>copied.push(text)})};};

test('Writeは内部メモを読まずに本文とAI入力を組み立て、メモの違いで結果を変えない',()=>{
  const input={...materials,get privateMemo(){throw new Error('must not read');}};
  assert.equal(composeDocument(input),composeDocument({...materials,privateMemo:'別の秘密'}));
  assert.deepEqual(writerAIRequest(input),writerAIRequest({...materials,privateMemo:'秘密にする事情'}));
  assert.ok(!JSON.stringify(writerAIRequest({...materials,privateMemo:'INTERNAL_MEMO_9E51'})).includes('INTERNAL_MEMO_9E51'));
});
test('Writeの文書案は検出・現行版の確認・認可を通り、内部メモを共有ファイルへ混ぜない',async()=>{
  const {w,saved}=setup(),body=composeDocument(materials),{result,policy}=prepareDocument(body,'未発表企画ALPHA');
  assert.ok(!result.text.includes('山田太郎'));assert.ok(!result.text.includes('taro@example.test'));assert.ok(!result.text.includes('未発表企画ALPHA'));
  w.setDocument(result,policy);w.setDestination('share-file');await assert.rejects(w.export());assert.equal(saved.length,0);await w.approve();await w.export();assert.equal(saved[0].data.payload.text,result.text);
  const draft={format:'sumi-writer-draft',version:1,...materials,privateMemo:'内部だけの事情',document:body,hiddenWords:'未発表企画ALPHA'};
  await w.saveDraft(draft,'sumi-product-passphrase','sumi-writer.sumi');assert.equal(saved[1].name,'sumi-writer.sumi');assert.deepEqual(restoreWriterDraft(await decryptDraft(saved[1].data,'sumi-product-passphrase')), {...materials,privateMemo:draft.privateMemo,document:body,hiddenWords:draft.hiddenWords});assert.ok(!JSON.stringify(saved[0].data).includes(draft.privateMemo));
  w.setDocument(prepareDocument(body+'\n追加情報').result,policy);await assert.rejects(w.export());
});
test('Writeは空欄のある下書きも復元でき、AIの権限付き出力や不正な下書きを採用しない',()=>{
  const blank={format:'sumi-writer-draft',version:1,title:'',kind:'notice',facts:'',privateMemo:'内部メモだけ記載',document:'',hiddenWords:''};assert.equal(restoreWriterDraft(blank).privateMemo,blank.privateMemo);
  for(const raw of [null,{document:''},{document:'本文',allow:true},{document:'x'.repeat(50001)}])assert.throws(()=>validateWriterProposal(raw));
  assert.equal(validateWriterProposal({document:'提案した本文'}),'提案した本文');
  assert.throws(()=>restoreWriterDraft({...blank,kind:'executable'}));assert.throws(()=>restoreWriterDraft({...blank,privateMemo:'x'.repeat(10001)}));
});
test('Proveは対応する証明形式だけを採用し、AIによる偽の保証や任意コードを拒否する',()=>{
  const plan=defaultProofPlan('各班の人数の合計');assert.deepEqual(validateProofPlan(plan),plan);
  for(const changed of [{...plan,protocol:'prove-no-leakage'},{...plan,code:'execute()'},{...plan,discloses:[]},{...plan,doesNotProve:[]},{...plan,context:'x'.repeat(161)}])assert.throws(()=>validateProofPlan(changed));
});
test('ProveのAI入力は数値の違いに依存せず、採用した用途に結び付いた実際のZK証明を生成する',()=>{
  const purpose='各班の人数の合計',a=proofAIRequest(purpose,[12,18,9,21]),b=proofAIRequest(purpose,[1,2,3]);assert.deepEqual(a,b);assert.ok(!a.prompt.includes('[12,18,9,21]'));
  const plan=validateProofPlan(defaultProofPlan(purpose)),proof=proveCommittedSum([12,18,9,21],plan.context);assert.equal(proof.sum,60);assert.equal(verifyCommittedSum(proof),true);assert.equal(verifyCommittedSum({...proof,context:'別の用途'}),false);assert.ok(!('values' in proof));
});
test('共通AIクライアントは同意前に送信せず、モデルのローカル性を確認してから提案を取得する',async()=>{
  const {w}=setup(),calls=[],transport={async request(endpoint,path,body,options){calls.push({endpoint,path,body,options});if(path==='/api/show')return {model_info:{architecture:'test'}};if(path==='/api/generate')return {response:'{"document":"提案した本文"}'};return {models:[{name:'qwen:test',size:2000000,details:{format:'gguf'}},{name:'qwen:cloud',size:2000000,details:{format:'gguf'}},{name:'remote:test',size:2000000,remote_host:'remote.test',details:{format:'gguf'}}]};}};
  const assistant=createLocalAssistant(w,transport);assert.deepEqual(await assistant.models('http://127.0.0.1:11434'),['qwen:test']);calls.length=0;
  const spec=writerAIRequest({...materials,privateMemo:'PRIVATE_SENTINEL'});await assert.rejects(assistant.generate('http://127.0.0.1:11434','qwen:test',spec,false));assert.equal(calls.length,0);
  const result=await assistant.generate('http://127.0.0.1:11434','qwen:test',spec,true);assert.deepEqual(result,{document:'提案した本文'});assert.deepEqual(calls.map(c=>c.path),['/api/show','/api/generate']);assert.ok(!JSON.stringify(calls).includes('PRIVATE_SENTINEL'));
});
test('共通AIクライアントは遠隔モデル・版の変更・不正な応答を拒否する',async()=>{
  for(const mode of ['remote','stale','invalid-json']){
    const {w}=setup(),calls=[],assistant=createLocalAssistant(w,{async request(_,path){calls.push(path);if(path==='/api/show'){if(mode==='stale')w.clear();return mode==='remote'?{remote_host:'cloud.test',model_info:{a:1}}:{model_info:{a:1}};}return {response:'not json'};}});
    await assert.rejects(assistant.generate('http://127.0.0.1:11434','qwen:test',proofAIRequest('人数の合計'),true));if(mode!=='invalid-json')assert.deepEqual(calls,['/api/show']);
  }
});
