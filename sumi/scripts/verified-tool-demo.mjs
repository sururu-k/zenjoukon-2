import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { makeSigningKey } from '../src/crypto.js';
import { createSignedSum } from '../src/secure/verified-sum-bridge.js';
import { createVerifiedSumToolGateway } from '../src/secure/verified-tool-gateway.js';

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
} finally {
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}
