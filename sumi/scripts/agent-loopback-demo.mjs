import {createServer} from 'node:http';
import assert from 'node:assert/strict';
import {prepareAgentDocument} from '../src/agent-document.js';
import {createAgentAssistant} from '../src/agent-assistant.js';
import {createAgentLocalTransport} from './agent-local-transport.mjs';
import examplePolicy from '../src/school-policy.example.json' with {type:'json'};

// Fictional data and a simulated approval. The server is a fixture, not an LLM.
// Bind exclusively before doing anything, so no request reaches an existing service.
const source='青空祭は山田が準備します。連絡先：teacher@example.test';
const schoolPolicy=structuredClone(examplePolicy);
schoolPolicy.documentProof.forbidden=['青空祭','山田'];
const captured=[];
const server=createServer(async(req,res)=>{
  let body='';for await(const chunk of req)body+=chunk;
  captured.push({path:req.url,body:JSON.parse(body)});
  res.setHeader('content-type','application/json');
  if(req.url==='/api/show')res.end(JSON.stringify({model_info:{architecture:'fixture'}}));
  else if(req.url==='/api/generate')res.end(JSON.stringify({response:JSON.stringify({summary:'行事の準備に関する連絡です。'})}));
  else{res.statusCode=404;res.end('{}');}
});
try{
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(11434,'127.0.0.1',resolve);});
  const prepared=prepareAgentDocument(source,'',schoolPolicy),gateway=prepared.gateway;
  const params={endpoint:'http://127.0.0.1:11434',model:'fixture:test',revision:gateway.revision,consented:true};
  const assistant=createAgentAssistant(gateway,createAgentLocalTransport(gateway));
  console.log('架空の学校文書・端末内HTTP・模擬承認の自動デモ（実際のLLMではありません）');
  console.log('原文：'+source);
  console.log('架空学校の共通設定：禁止語は青空祭・山田');
  console.log('送信前に加工：'+prepared.preview);
  await assert.rejects(assistant.summarize(params));assert.equal(captured.length,0);
  console.log('確認前：拒否。HTTPリクエストは０件。');
  gateway.approveDocument(gateway.revision); // Simulated for this demonstration only.
  const summary=await assistant.summarize(params);
  assert.deepEqual(captured.map(r=>r.path),['/api/show','/api/generate']);
  const prompt=JSON.parse(captured[1].body.prompt);
  assert.equal(prompt.document,prepared.preview);
  assert.ok(!JSON.stringify(captured).includes('山田'));
  assert.ok(!JSON.stringify(captured).includes('青空祭'));
  assert.ok(!JSON.stringify(captured).includes('teacher@example.test'));
  console.log('模擬承認後：127.0.0.1 の架空サービスに加工版を送信。');
  console.log('受信した文書：'+prompt.document);
  console.log('架空サービスの固定応答：'+summary);
  gateway.replaceDocument('日程が変わりました。');
  const after=await gateway.agent.execute({action:'read',resource:'approved-document',revision:gateway.revision});
  assert.equal(after.status,'denied');assert.equal(captured.length,2);
  console.log('文書変更後：再確認まで拒否。追加のHTTPリクエストなし。');
  console.log('※指定語・検出の漏れはあり得ます。実LLM・OS・端末全体の安全を保証しません。');
} catch(error){
  console.error(error?.code==='EADDRINUSE'?'127.0.0.1:11434 が使用中のため、既存サービスには接続せず中止しました。':error.message);
  process.exitCode=1;
} finally {
  if(server.listening)await new Promise(resolve=>server.close(resolve));
}
