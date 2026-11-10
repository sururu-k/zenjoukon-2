import assert from 'node:assert/strict';
import { makeSigningKey } from '../src/crypto.js';
import { createRandomizedSumTool } from '../src/secure/randomized-sum-tool.js';
import { createVerifiedSumToolGateway, RANDOMIZED_SUM_TOOL } from '../src/secure/verified-tool-gateway.js';
import { createAgentVerifiedTool } from '../src/secure/agent-verified-tool.js';

const key=await makeSigningKey();
const trust={format:'sumi-sum-verifier-trust',version:1,threshold:1,publicKeys:[await crypto.subtle.exportKey('jwk',key.publicKey)]};
// Fictional input, held by this one trusted process. Do not infer actual votes.
const tool=createRandomizedSumTool({school:[true,false,true,false,true],community:[true,true,false,false]},[key]);
const verifier=createVerifiedSumToolGateway(trust,'fictional-reader',RANDOMIZED_SUM_TOOL);
for(const datasetId of ['school','community']){
  const first=await verifier.begin(datasetId), second=await verifier.begin(datasetId);
  const [a,b]=await Promise.all([tool.run(first),tool.run(second)]);
  const [ra,rb]=await Promise.all([verifier.accept(first.request.requestId,a),verifier.accept(second.request.requestId,b)]);
  assert.equal(ra.sum,rb.sum);
  console.log(`${datasetId}: ${ra.count} 件のランダム化回答の合計 ${ra.sum}。署名と合計証明を検証し、再要求では同じ抽選結果を再利用。`);
}
const owner=createAgentVerifiedTool({trust,recipient:'agent-reader',datasets:['school','community'],toolName:RANDOMIZED_SUM_TOOL,transport:call=>tool.run(call)});
assert.equal((await owner.agent.run({datasetId:'school',revision:0})).status,'denied');
owner.approve('school',0);
const result=await owner.agent.run({datasetId:'school',revision:0});
assert.equal(result.status,'completed');
console.log(`エージェントに検証済みランダム化合計 ${result.sum} を返しました。`);
console.log('入力はツール側の信頼された一つのプロセス内にあります。署名と証明は乱数の正しさを証明せず、再起動・他の公開をまたぐ予算管理もありません。');
