import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { makeSigningKey } from '../src/crypto.js';
import { createSignedSum } from '../src/secure/verified-sum-bridge.js';
import { createVerifiedSumToolGateway } from '../src/secure/verified-tool-gateway.js';
import { createAgentVerifiedTool } from '../src/secure/agent-verified-tool.js';
import { attestVerifiedToolResult, verifyToolResultAttestation } from '../src/secure/tool-result-attestation.js';
import { createVerifiedToolAuditLog, verifyToolAuditLog } from '../src/secure/verified-tool-audit-log.js';

// Fictional local tool. The independent verifier chooses its trust keys and
// request; the HTTP server is not trusted merely because it returned a sum.
const datasets = { community: [12, 18, 9], school: [10, 8, 6] };
const keys = await Promise.all([makeSigningKey(), makeSigningKey()]);
const trust = { format: 'sumi-sum-verifier-trust', version: 1, threshold: 2, publicKeys: await Promise.all(keys.map(k => crypto.subtle.exportKey('jwk', k.publicKey))) };
const gateway = createVerifiedSumToolGateway(trust, 'local-demo-verifier');
const server = createServer(async (req, res) => {
  try {
    if (req.method !== 'POST' || req.url !== '/sum') throw new Error('unknown tool');
    const chunks = []; let size = 0;
    for await (const chunk of req) { size += chunk.length; if (size > 4096) throw new Error('request too large'); chunks.push(chunk); }
    const call = JSON.parse(Buffer.concat(chunks).toString());
    if (call.name !== 'sumi.sum.v1' || !Object.hasOwn(datasets, call.arguments?.datasetId)) throw new Error('unknown dataset');
    const values = datasets[call.arguments.datasetId];
    const evidence = await createSignedSum(values, call.request, keys);
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ result: { sum: evidence.payload.proof.sum, count: evidence.payload.proof.count }, evidence }));
  } catch { res.writeHead(400).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
try {
  for (const dataset of ['community', 'school']) {
    const call = await gateway.begin(dataset);
    const response = await fetch(`http://127.0.0.1:${server.address().port}/sum`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(call), signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error('ツールの実行に失敗しました。');
    const output = await response.json(), changed = structuredClone(output);
    changed.result.sum++;
    await assert.rejects(gateway.accept(call.request.requestId, changed));
    const verified = await gateway.accept(call.request.requestId, output);
    await assert.rejects(gateway.accept(call.request.requestId, output));
    console.log(`${dataset}: ${verified.count} 件の合計 ${verified.sum}。結果と証明・${verified.verifiedSignatures}鍵の署名が一致しました。`);
  }
  console.log('結果の改変と同一依頼の再利用を拒否。入力データの真実性や取得元は証明しません。');
  let sends = 0, capturedCall, capturedResponse;
  const owner = createAgentVerifiedTool({ trust, recipient: 'local-agent-verifier', datasets: ['school', 'community'], transport: async call => {
    sends++;
    const response = await fetch(`http://127.0.0.1:${server.address().port}/sum`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(call), signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error('tool failure');
    capturedCall = call;
    capturedResponse = await response.json();
    return capturedResponse;
  } });
  assert.equal((await owner.agent.run({ datasetId: 'school', revision: 0 })).status, 'denied');
  assert.equal(sends, 0);
  owner.approve('school', 0); // Simulated owner approval for fictional data.
  const result = await owner.agent.run({ datasetId: 'school', revision: 0 });
  assert.equal(result.status, 'completed');
  assert.equal((await owner.agent.run({ datasetId: 'school', revision: 0 })).status, 'denied');
  assert.equal(sends, 1);
  console.log(`エージェント: 確認前は通信せず拒否。模擬承認後に ${result.count} 件の合計 ${result.sum} を検証し、承認の再利用を拒否。`);
  const auditor = await makeSigningKey();
  const auditTrust = { format: 'sumi-tool-audit-trust', version: 1, threshold: 1, publicKeys: [await crypto.subtle.exportKey('jwk', auditor.publicKey)] };
  const record = await attestVerifiedToolResult('school', capturedCall.request, capturedResponse.evidence, trust, [auditor]);
  const checked = await verifyToolResultAttestation(record, 'school', capturedCall.request, capturedResponse.evidence, trust, auditTrust);
  assert.equal(checked.sum, result.sum);
  const forged = structuredClone(record); forged.payload.sum++;
  await assert.rejects(verifyToolResultAttestation(forged, 'school', capturedCall.request, capturedResponse.evidence, trust, auditTrust));
  console.log('署名付き結果記録と元の証明を独立した信頼鍵で検証し、記録の改変を拒否。');
  const auditLog = createVerifiedToolAuditLog(trust, auditTrust);
  const checkpoint = await auditLog.append('school', capturedCall.request, capturedResponse.evidence, record);
  const snapshot = auditLog.snapshot();
  const expectedRequests = new Map([[capturedCall.request.requestId, { datasetId: 'school', request: capturedCall.request }]]);
  await verifyToolAuditLog(snapshot, checkpoint, expectedRequests, trust, auditTrust);
  const truncated = structuredClone(snapshot); truncated.entries.pop();
  await assert.rejects(verifyToolAuditLog(truncated, checkpoint, expectedRequests, trust, auditTrust));
  console.log('記録をハッシュで連結し、別に保持したチェックポイントで削除を検出。');
} finally {
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}
