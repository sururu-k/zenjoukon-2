import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateAgentAction, createDecisionReceipt, verifyDecisionReceipt, createAgentGateway } from '../src/agent-guard.js';

test('登録された役割・操作・対象だけを許可し、未登録と外部送信は拒否する',()=>{
  assert.equal(evaluateAgentAction({actor:'agent',action:'summarize',resource:'approved-document'}).decision,'allow');
  assert.equal(evaluateAgentAction({actor:'agent',action:'export',resource:'approved-document'}).decision,'review');
  for(const request of [{actor:'agent',action:'send',resource:'external-service'},{actor:'administrator',action:'read',resource:'private-consultation'},{actor:'unknown',action:'read',resource:'own-document'},null])assert.equal(evaluateAgentAction(request).decision,'deny');
});
test('ゲートウェイは送信・削除を実行せず、文書変更後の提案を拒否する',async()=>{
  const gateway=createAgentGateway('公開を許可した文書。二文目です。');
  const allowed=await gateway.execute({action:'summarize',resource:'approved-document',revision:gateway.revision,actor:'administrator'});
  assert.equal(allowed.status,'completed');assert.equal(allowed.receipt.input.actor,'agent');
  for(const [action,resource] of [['send','external-service'],['delete','class-document'],['export','approved-document']])assert.equal((await gateway.execute({action,resource,revision:gateway.revision})).status,'denied');
  const pending=gateway.execute({action:'read',resource:'approved-document',revision:gateway.revision});gateway.replaceDocument('変更後');assert.equal((await pending).status,'denied');
});
test('判定記録はルールから再計算でき、操作や結果の変更を検出する',async()=>{
  const receipt=await createDecisionReceipt({actor:'agent',action:'send',resource:'external-service'});assert.equal(await verifyDecisionReceipt(receipt),true);
  const changed=structuredClone(receipt);changed.result.decision='allow';assert.equal(await verifyDecisionReceipt(changed),false);
  const altered=structuredClone(receipt);altered.input.resource='approved-document';assert.equal(await verifyDecisionReceipt(altered),false);
});
