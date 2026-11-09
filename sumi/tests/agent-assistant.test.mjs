import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareAgentDocument } from '../src/agent-document.js';
import { createAgentAssistant } from '../src/agent-assistant.js';
import { createAgentLocalTransport } from '../scripts/agent-local-transport.mjs';

test('未確認・未同意なら送らず、AIへは確認した加工版だけを渡す',async()=>{
  const secret='sample@example.test';const prepared=prepareAgentDocument(`連絡先：${secret}`),gateway=prepared.gateway,calls=[];
  const transport=createAgentLocalTransport(gateway,async(url,options)=>{calls.push({url,body:JSON.parse(options.body)});return {ok:true,json:async()=>url.endsWith('/api/show')?{model_info:{architecture:'test'}}:{response:'{"summary":"連絡先を加工しました。"}'}};});
  const assistant=createAgentAssistant(gateway,transport),params={endpoint:'http://127.0.0.1:11434',model:'local:test',revision:gateway.revision,consented:true};
  await assert.rejects(assistant.summarize({...params,consented:false}));await assert.rejects(assistant.summarize(params));assert.equal(calls.length,0);
  gateway.approveDocument(gateway.revision);
  assert.equal(await assistant.summarize(params),'連絡先を加工しました。');
  assert.deepEqual(calls.map(c=>new URL(c.url).pathname),['/api/show','/api/generate']);
  assert.ok(!JSON.stringify(calls).includes(secret));assert.ok(JSON.stringify(calls).includes('[メール非公開]'));
  await assert.rejects(assistant.summarize({...params,endpoint:'https://example.test'}));assert.equal(calls.length,2);
});
test('文書変更後のAI応答、遠隔モデル、余分な応答フィールドを拒否する',async()=>{
  for(const mode of ['stale','remote','extra']){
    const gateway=prepareAgentDocument('架空の文書です。').gateway;gateway.approveDocument(gateway.revision);const revision=gateway.revision;
    const transport={async request(_endpoint,path){if(path==='/api/show')return mode==='remote'?{remote_host:'remote',model_info:{architecture:'test'}}:{model_info:{architecture:'test'}};if(mode==='stale')gateway.replaceDocument('変更後');return {response:mode==='extra'?'{"summary":"要約","action":"send"}':'{"summary":"要約"}'};}};
    await assert.rejects(createAgentAssistant(gateway,transport).summarize({endpoint:'http://127.0.0.1:11434',model:'local:test',revision,consented:true}));
  }
});


test('共通設定の語句は通常の検出が拾わない文でもAI送信前に伏せる',async()=>{
  const secret='山田';const prepared=prepareAgentDocument(`文化祭は${secret}が準備します。`),gateway=prepared.gateway,calls=[];
  assert.ok(!prepared.preview.includes(secret));gateway.approveDocument(gateway.revision);
  const transport=createAgentLocalTransport(gateway,async(url,options)=>{calls.push(JSON.parse(options.body));return {ok:true,json:async()=>url.endsWith('/api/show')?{model_info:{architecture:'test'}}:{response:'{"summary":"準備の連絡です。"}'}};});
  await createAgentAssistant(gateway,transport).summarize({endpoint:'http://127.0.0.1:11434',model:'local:test',revision:gateway.revision,consented:true});
  assert.equal(calls.length,2);assert.ok(!JSON.stringify(calls).includes(secret));assert.ok(JSON.stringify(calls).includes('[非公開]'));
});
