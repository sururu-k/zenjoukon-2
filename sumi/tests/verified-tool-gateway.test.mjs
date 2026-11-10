import test from 'node:test';
import assert from 'node:assert/strict';
import { makeSigningKey } from '../src/crypto.js';
import { createSignedSum } from '../src/secure/verified-sum-bridge.js';
import { createVerifiedSumToolGateway } from '../src/secure/verified-tool-gateway.js';

async function setup() {
  const keys = await Promise.all([makeSigningKey(), makeSigningKey()]);
  const trust = { format: 'sumi-sum-verifier-trust', version: 1, threshold: 2, publicKeys: await Promise.all(keys.map(k => crypto.subtle.exportKey('jwk', k.publicKey))) };
  return { keys, gateway: createVerifiedSumToolGateway(trust, 'independent-verifier') };
}
async function response(call, keys) {
  const evidence = await createSignedSum([4, 7, 9], call.request, keys);
  return { result: { sum: 20, count: 3 }, evidence };
}

test('returns only verified output for the requested tool and dataset', async () => {
  const {keys, gateway} = await setup();
  const call = await gateway.begin('school');
  const result = await gateway.accept(call.request.requestId, await response(call, keys));
  assert.deepEqual(result, { name: 'sumi.sum.v1', datasetId: 'school', sum: 20, count: 3, verifiedSignatures: 2 });
  assert.equal(Object.isFrozen(result), true);
});

test('rejects altered output, another request, unknown fields and replay', async () => {
  const {keys, gateway} = await setup();
  const a = await gateway.begin('school'), b = await gateway.begin('community');
  const output = await response(a, keys);
  await assert.rejects(gateway.accept(a.request.requestId, {...output, result:{sum:21,count:3}}));
  await assert.rejects(gateway.accept(a.request.requestId, {...output, extra:'unverified output'}));
  await assert.rejects(gateway.accept(b.request.requestId, output));
  const changed = structuredClone(output); changed.evidence.payload.proof.sum++;
  await assert.rejects(gateway.accept(a.request.requestId, changed));
  const wrongKeys = await Promise.all([makeSigningKey(), makeSigningKey()]);
  await assert.rejects(gateway.accept(a.request.requestId, await response(a, wrongKeys)));
  await gateway.accept(a.request.requestId, output);
  await assert.rejects(gateway.accept(a.request.requestId, output));
  await assert.rejects(gateway.begin('invalid dataset'));
});

test('only one concurrent verification can consume a request', async () => {
  const {keys, gateway} = await setup();
  const call = await gateway.begin('community'), output = await response(call, keys);
  const results = await Promise.allSettled([gateway.accept(call.request.requestId, output), gateway.accept(call.request.requestId, output)]);
  assert.equal(results.filter(x => x.status === 'fulfilled').length, 1);
  assert.equal(results.filter(x => x.status === 'rejected').length, 1);
});
