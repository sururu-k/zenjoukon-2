import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateAgentAction, createDecisionReceipt, verifyDecisionReceipt, createAgentGateway } from '../src/agent-guard.js';

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
