import assert from 'node:assert/strict';
import { composeDocument, prepareDocument } from '../src/document-workflow.js';
import { createWorkspace } from '../src/workspace.js';
import { verifyPackage } from '../src/crypto.js';
import { proveCommittedSum, verifyCommittedSum } from '../src/secure/zk.js';
import { prepareAgentDocument } from '../src/agent-document.js';

// All inputs are fictional. Effects are captured in memory; no files or network
// are used. Approval here is simulated solely to demonstrate the workflow.
const saved=[];
const workspace=createWorkspace({download:async(name,data)=>saved.push({name,data})});
console.log('Sumi 自動デモ（架空データ・承認は模擬・外部送信なし）\n');

console.log('【Write】教員が行事の連絡を作成');
const input={title:'作品発表会のお知らせ',kind:'notice',facts:'来月、校内で作品発表会を開催します。',privateMemo:'内部メモ：準備担当の調整は未確定'};
const draft=composeDocument(input);
assert.ok(!draft.includes(input.privateMemo));
console.log('本文案：'+draft.replaceAll('\n',' / '));
console.log('内部メモは本文生成に含まれません。\n');

console.log('【Gate】既存の連絡文を共有用に加工');
const prepared=prepareDocument('作品発表会は来月です。連絡先：teacher@example.test');
assert.ok(!prepared.result.text.includes('teacher@example.test'));
workspace.setDocument(prepared.result,prepared.policy);workspace.setDestination('share-file');
console.log('共有版：'+prepared.result.text);
await assert.rejects(workspace.export());assert.equal(saved.length,0);
console.log('確認前の書き出し：拒否');
await workspace.approve();const receipt=await workspace.export();
assert.equal(saved.length,1);assert.equal((await verifyPackage(saved[0].data,receipt.fingerprint)).valid,true);
console.log('確認を模擬した後：署名付き共有データをメモリ内に生成し、署名を検証');
workspace.setDocument(prepareDocument('変更された連絡文。').result,prepared.policy);
await assert.rejects(workspace.export());
console.log('確認後の文書変更：再確認まで書き出しを拒否\n');

console.log('【Prove】個別の人数を証明ファイルに含めず、合計を検証');
const proof=proveCommittedSum([12,18,9,21],'各班の参加人数');
assert.equal(proof.sum,60);assert.ok(!Object.hasOwn(proof,'values'));
assert.equal(verifyCommittedSum(proof),true);assert.equal(verifyCommittedSum({...proof,sum:61}),false);
console.log(`公開内容：${proof.count}件、合計 ${proof.sum}、用途、コミットメント、証明`);
console.log('元の合計：検証成功 / 合計を61に変更：検証失敗');
console.log('※件数・合計などから個別値が推測される場合があります。\n');

console.log('【Agent】確認した版だけを取り出す');
const agentDocument=prepareAgentDocument('作品発表会は来月です。連絡先：teacher@example.test');
const {gateway}=agentDocument;
assert.ok(!agentDocument.preview.includes('teacher@example.test'));
console.log('自動加工した文書：'+agentDocument.preview);
const proposal={action:'summarize',resource:'approved-document',revision:gateway.revision};
const before=await gateway.agent.execute(proposal);assert.equal(before.status,'denied');
console.log(`確認前の要約：拒否（ルール ${before.event.policyDecision} / 実行 ${before.event.status}）`);
gateway.approveDocument(gateway.revision);
const summary=await gateway.agent.execute(proposal);assert.equal(summary.status,'completed');
console.log(`確認を模擬した後の要約（実行 ${summary.event.status}）：`+summary.value);
const external=await gateway.agent.execute({action:'send',resource:'external-service',revision:gateway.revision});
assert.equal(external.status,'denied');console.log(`外部送信の提案：拒否（ルール ${external.event.policyDecision} / 実行 ${external.event.status}、通信処理なし）`);
gateway.replaceDocument('日程を変更しました。');
assert.equal((await gateway.agent.execute({...proposal,revision:gateway.revision})).status,'denied');
console.log('文書変更後の要約：再確認まで拒否');
console.log('\nこのデモはアプリ内の限定した操作を示します。実環境全体の安全や情報漏洩の不在は証明しません。');
