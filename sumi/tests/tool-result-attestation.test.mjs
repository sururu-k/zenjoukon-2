import test from 'node:test';
import assert from 'node:assert/strict';
import { makeSigningKey } from '../src/crypto.js';
import { createSignedSum } from '../src/secure/verified-sum-bridge.js';
import { createVerifiedSumToolGateway } from '../src/secure/verified-tool-gateway.js';
import { attestVerifiedToolResult, verifyToolResultAttestation } from '../src/secure/tool-result-attestation.js';

async function fixture() {
  const prover = await makeSigningKey(), auditor = await makeSigningKey();
  const proofTrust = {format:'sumi-sum-verifier-trust',version:1,threshold:1,publicKeys:[await crypto.subtle.exportKey('jwk',prover.publicKey)]};
  const auditTrust = {format:'sumi-tool-audit-trust',version:1,threshold:1,publicKeys:[await crypto.subtle.exportKey('jwk',auditor.publicKey)]};
  const call = await createVerifiedSumToolGateway(proofTrust,'auditor').begin('school');
  const evidence = await createSignedSum([4,7,9],call.request,[prover]);
  const record = await attestVerifiedToolResult('school',call.request,evidence,proofTrust,[auditor]);
  return {prover,auditor,proofTrust,auditTrust,call,evidence,record};
}

test('separately verifies proof and signed result record without exposing inputs', async () => {
  const f=await fixture();
  const checked=await verifyToolResultAttestation(f.record,'school',f.call.request,f.evidence,f.proofTrust,f.auditTrust);
  assert.deepEqual(checked,{datasetId:'school',requestId:f.call.request.requestId,sum:20,count:3,auditSignatures:1,proofSignatures:1});
  assert.equal(Object.hasOwn(f.record.payload,'values'),false);
  assert.equal(Object.hasOwn(f.record,'evidence'),false);
});

test('rejects altered records, proof, dataset, request and untrusted audit keys', async () => {
  const f=await fixture();
  const check=(record=f.record,dataset='school',request=f.call.request,evidence=f.evidence,trust=f.auditTrust)=>verifyToolResultAttestation(record,dataset,request,evidence,f.proofTrust,trust);
  const modified=structuredClone(f.record);modified.payload.sum++;
  await assert.rejects(check(modified));
  const badProof=structuredClone(f.evidence);badProof.payload.proof.sum++;
  await assert.rejects(check(f.record,'school',f.call.request,badProof));
  await assert.rejects(check(f.record,'community'));
  await assert.rejects(check(f.record,'school',{...f.call.request,recipient:'other'}));
  const other=await makeSigningKey();
  await assert.rejects(check(f.record,'school',f.call.request,f.evidence,{...f.auditTrust,publicKeys:[await crypto.subtle.exportKey('jwk',other.publicKey)]}));
  await assert.rejects(attestVerifiedToolResult('community',f.call.request,f.evidence,f.proofTrust,[f.auditor]));
});
