import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateAgentAction, createDecisionReceipt, verifyDecisionReceipt, createAgentGateway } from '../src/agent-guard.js';
import { canExecuteAgent } from '../src/agent-access.js';
import { prepareAgentDocument } from '../src/agent-document.js';

test('エージェントへ渡す前に自動加工し、加工版への確認が必要',async()=>{
  const secret='sample@example.test';const prepared=prepareAgentDocument(`連絡先：${secret}`);
  assert.equal(prepared.maskedCount,1);assert.ok(!prepared.preview.includes(secret));
  const request={action:'read',resource:'approved-document',revision:prepared.gateway.revision};
  assert.equal((await prepared.gateway.agent.execute(request)).status,'denied');
  prepared.gateway.approveDocument(request.revision);
  const result=await prepared.gateway.agent.execute(request);assert.equal(result.value,prepared.preview);assert.ok(!result.value.includes(secret));
});
test('追加の非公開語句が上限を超える場合は黙って無視せず拒否する',()=>{
  assert.throws(()=>prepareAgentDocument('架空の文書','x\n'.repeat(101)));
  assert.throws(()=>prepareAgentDocument('架空の文書','x'.repeat(101)));
  assert.ok(!prepareAgentDocument('内部限定の計画','内部限定').preview.includes('内部限定'));
});
test('差し替えた文書も加工し、前の確認を失効する',async()=>{
  const doc=prepareAgentDocument('最初の連絡','内部限定');const gateway=doc.gateway;
  gateway.approveDocument(gateway.revision);
  gateway.replaceDocument('内部限定の連絡先：other@example.test');
  assert.ok(!doc.preview.includes('内部限定'));assert.ok(!doc.preview.includes('other@example.test'));
  const request={action:'read',resource:'approved-document',revision:gateway.revision};
  assert.equal((await gateway.agent.execute(request)).status,'denied');
  gateway.approveDocument(request.revision);
  assert.equal((await gateway.agent.execute(request)).value,doc.preview);
  const savedRevision=gateway.revision;assert.throws(()=>gateway.replaceDocument(''));assert.equal(gateway.revision,savedRevision);
});

test('エージェントの実行条件は未指定や真偽値以外を許可しない',()=>{
  const all={fresh:true,approved:true,allowed:true,target:true,supported:true};
  assert.equal(canExecuteAgent(all),true);assert.equal(canExecuteAgent(null),false);
  for(const key of Object.keys(all))for(const value of [false,undefined,'true',1])assert.equal(canExecuteAgent({...all,[key]:value}),false);
});

test('登録された役割・操作・対象だけを許可し、未登録と外部送信は拒否する',()=>{
  assert.equal(evaluateAgentAction({actor:'agent',action:'summarize',resource:'approved-document'}).decision,'allow');
  assert.equal(evaluateAgentAction({actor:'agent',action:'export',resource:'approved-document'}).decision,'review');
  for(const request of [{actor:'agent',action:'send',resource:'external-service'},{actor:'administrator',action:'read',resource:'private-consultation'},{actor:'unknown',action:'read',resource:'own-document'},null])assert.equal(evaluateAgentAction(request).decision,'deny');
});
test('確認した版だけをエージェントに渡し、変更後は再確認が必要',async()=>{
  const gateway=createAgentGateway('公開を許可した文書。二文目です。');
  const proposal=()=>({action:'read',resource:'approved-document',revision:gateway.revision});
  assert.equal(gateway.agent.approveDocument,undefined);
  assert.equal((await gateway.agent.execute(proposal())).status,'denied');
  gateway.approveDocument(gateway.revision);
  const allowed=await gateway.agent.execute({action:'summarize',resource:'approved-document',revision:gateway.revision,actor:'administrator'});
  assert.equal(allowed.status,'completed');assert.equal(allowed.receipt.input.actor,'agent');
  for(const [action,resource] of [['send','external-service'],['delete','class-document'],['export','approved-document']])assert.equal((await gateway.agent.execute({action,resource,revision:gateway.revision})).status,'denied');
  const old=gateway.revision,pending=gateway.agent.execute(proposal());gateway.replaceDocument('変更後');assert.equal((await pending).status,'denied');
  assert.throws(()=>gateway.approveDocument(old));
  assert.equal((await gateway.agent.execute(proposal())).status,'denied');
  gateway.approveDocument(gateway.revision);
  assert.equal((await gateway.agent.execute(proposal())).value,'変更後');
});
test('判定と実行結果を分け、非同期処理中の提案の書き換えを拒否する',async()=>{
  const secret='非公開の本文';const gateway=createAgentGateway(secret);
  const input={action:'read',resource:'approved-document',revision:gateway.revision};
  const blocked=await gateway.agent.execute(input);
  assert.equal(blocked.event.policyDecision,'allow');assert.equal(blocked.event.status,'denied');
  assert.ok(!JSON.stringify(blocked.event).includes(secret));
  gateway.approveDocument(gateway.revision);
  const pending=gateway.agent.execute(input);
  gateway.replaceDocument('差し替え後');gateway.approveDocument(gateway.revision);input.revision=gateway.revision;
  const stale=await pending;assert.equal(stale.status,'denied');assert.equal(stale.event.requestedRevision,0);assert.equal(stale.event.currentRevision,1);
  const denied=await gateway.agent.execute({action:'send',resource:'external-service',revision:gateway.revision});
  assert.equal(denied.event.policyDecision,'deny');assert.equal(denied.event.status,'denied');
});
test('判定記録の整合性を再計算する（記録の発行者や操作の実行は証明しない）',async()=>{
  const receipt=await createDecisionReceipt({actor:'agent',action:'send',resource:'external-service'});assert.equal(await verifyDecisionReceipt(receipt),true);
  const changed=structuredClone(receipt);changed.result.decision='allow';assert.equal(await verifyDecisionReceipt(changed),false);
  const altered=structuredClone(receipt);altered.input.resource='approved-document';assert.equal(await verifyDecisionReceipt(altered),false);
});
