import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareDocumentPolicyStatement } from '../src/secure/document-policy.js';

test('文書と禁止語の一致を確認し、公開予定の情報に原文を含めない',async()=>{
  const result=await prepareDocumentPolicyStatement('明日は文化祭です。',['山田','090-1234-5678']);
  assert.match(result.statement.commitment,/^[a-f0-9]{64}$/);
  assert.match(result.statement.policyDigest,/^[a-f0-9]{64}$/);
  assert.ok(!JSON.stringify(result.statement).includes('文化祭'));
  assert.ok(!JSON.stringify(result.statement).includes('山田'));
  assert.equal(result.witness.document,'明日は文化祭です。');
  const again=await prepareDocumentPolicyStatement('明日は文化祭です。',['山田','090-1234-5678']);
  assert.notEqual(result.statement.commitment,again.statement.commitment);
  assert.equal(result.statement.policyDigest,again.statement.policyDigest);
});
test('禁止語の一致、不正なUnicode、空の禁止語や上限超過を拒否する',async()=>{
  for(const [doc,terms] of [['山田さん',['山田']],['文書',['']],['文書',['同じ','同じ']],['\ud800',['秘密']],['文書',['\ud800']],['あ'.repeat(1400),['秘密']]]){
    await assert.rejects(prepareDocumentPolicyStatement(doc,terms));
  }
  const result=await prepareDocumentPolicyStatement('Ａ',['A']);
  assert.equal(result.witness.policy.matching,'exact-unicode');
});
