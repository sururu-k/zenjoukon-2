import assert from 'node:assert/strict';
import { makeSigningKey, hash, canonical } from '../src/crypto.js';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { prepareRandomizedSumSnapshot, openRandomizedSumSnapshot } from '../src/secure/sealed-randomized-sum-tool.js';
import { createVerifiedSumToolGateway, RANDOMIZED_SUM_TOOL } from '../src/secure/verified-tool-gateway.js';
import { signAgentToolPolicy, createAgentToolFromSignedPolicy } from '../src/secure/signed-agent-tool-policy.js';
import { attestVerifiedToolResult } from '../src/secure/tool-result-attestation.js';
import { createVerifiedToolAuditLog } from '../src/secure/verified-tool-audit-log.js';
import { sealToolAuditLog, openToolAuditLog } from '../src/secure/sealed-tool-audit-log.js';

const key=await makeSigningKey();
const trust={format:'sumi-sum-verifier-trust',version:1,threshold:1,publicKeys:[await crypto.subtle.exportKey('jwk',key.publicKey)]};
// Fictional input, held by this one trusted process. Do not infer actual votes.
const password='fictional-randomized-passphrase';
const prepared=await prepareRandomizedSumSnapshot({school:[true,false,true,false,true],community:[true,true,false,false]},password);
const directory=await mkdtemp(join(tmpdir(),'sumi-random-snapshot-'));
let stored;
try {
  const path=join(directory,'sample.json');
  await writeFile(path,JSON.stringify(prepared.envelope),{flag:'wx',mode:0o600});
  stored=JSON.parse(await readFile(path,'utf8'));
} finally {await rm(directory,{recursive:true,force:true});}
const tool=await openRandomizedSumSnapshot(stored,password,prepared.checkpoint,[key]);
const restarted=await openRandomizedSumSnapshot(stored,password,prepared.checkpoint,[key]);
const verifier=createVerifiedSumToolGateway(trust,'fictional-reader',RANDOMIZED_SUM_TOOL);
for(const datasetId of ['school','community']){
  const first=await verifier.begin(datasetId), second=await verifier.begin(datasetId);
  const [a,b]=await Promise.all([tool.run(first),restarted.run(second)]);
  const [ra,rb]=await Promise.all([verifier.accept(first.request.requestId,a),verifier.accept(second.request.requestId,b)]);
  assert.equal(ra.sum,rb.sum);
  console.log(`${datasetId}: ${ra.count} 件のランダム化回答の合計 ${ra.sum}。暗号化ファイルからの別インスタンス復元後も同じ抽選結果を再利用。`);
}
const policyKey=await makeSigningKey(), auditKey=await makeSigningKey();
const policyTrust={format:'sumi-agent-tool-policy-trust',version:1,threshold:1,publicKeys:[await crypto.subtle.exportKey('jwk',policyKey.publicKey)]};
const auditTrust={format:'sumi-tool-audit-trust',version:1,threshold:1,publicKeys:[await crypto.subtle.exportKey('jwk',auditKey.publicKey)]};
const policy={format:'sumi-agent-tool-policy',version:2,policyId:'random-demo-policy',recipient:'agent-reader',datasets:['school','community'],minimumCount:3,tool:RANDOMIZED_SUM_TOOL};
const signedPolicy=await signAgentToolPolicy(policy,[policyKey]), expectedPolicyHash=await hash(canonical(policy));
const log=createVerifiedToolAuditLog(trust,auditTrust), expectedRequests=new Map();
const {owner}=await createAgentToolFromSignedPolicy({signedPolicy,expectedPolicyHash,policyTrust,proofTrust:trust,transport:call=>tool.run(call),recordCandidate:async ({datasetId,tool:mode,request,evidence})=>{
  assert.equal(mode,RANDOMIZED_SUM_TOOL);
  const record=await attestVerifiedToolResult(datasetId,request,evidence,trust,[auditKey],RANDOMIZED_SUM_TOOL);
  await log.append(datasetId,request,evidence,record,RANDOMIZED_SUM_TOOL);
  expectedRequests.set(request.requestId,{datasetId,request,tool:RANDOMIZED_SUM_TOOL});
}});
assert.equal((await owner.agent.run({datasetId:'school',revision:0})).status,'denied');
owner.approve('school',0);
const result=await owner.agent.run({datasetId:'school',revision:0});
assert.equal(result.status,'completed');
console.log(`エージェントに検証済みランダム化合計 ${result.sum} を返しました。`);
const checkpoint=log.checkpoint(), encrypted=await sealToolAuditLog(log.snapshot(),checkpoint,expectedRequests,trust,auditTrust,'fictional-demo-passphrase');
const restored=await openToolAuditLog(encrypted,'fictional-demo-passphrase',checkpoint,expectedRequests,trust,auditTrust);
assert.deepEqual(restored.checkpoint(),checkpoint);
const wrongMode=new Map([...expectedRequests].map(([id,value])=>[id,{...value,tool:'sumi.sum.v1'}]));
await assert.rejects(openToolAuditLog(encrypted,'fictional-demo-passphrase',checkpoint,wrongMode,trust,auditTrust));
console.log('署名付き方式指定、署名付き監査記録、暗号化復元を検証。別方式としての復元は拒否。');
console.log('署名と合計証明は保存された合計と整合する合成値に対するもので、元の回答や乱数の正しさは証明しません。別に保持したチェックポイントと同じファイルの復元のみ再抽選を防ぎ、他の公開をまたぐ予算管理はありません。');
