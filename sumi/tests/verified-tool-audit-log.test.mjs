import test from 'node:test';
import assert from 'node:assert/strict';
import { makeSigningKey } from '../src/crypto.js';
import { createSignedSum } from '../src/secure/verified-sum-bridge.js';
import { createVerifiedSumToolGateway } from '../src/secure/verified-tool-gateway.js';
import { attestVerifiedToolResult } from '../src/secure/tool-result-attestation.js';
import { createVerifiedToolAuditLog, verifyToolAuditLog } from '../src/secure/verified-tool-audit-log.js';

async function fixture() {
  const prover=await makeSigningKey(), auditor=await makeSigningKey();
  const proofTrust={format:'sumi-sum-verifier-trust',version:1,threshold:1,publicKeys:[await crypto.subtle.exportKey('jwk',prover.publicKey)]};
  const auditTrust={format:'sumi-tool-audit-trust',version:1,threshold:1,publicKeys:[await crypto.subtle.exportKey('jwk',auditor.publicKey)]};
  const gateway=createVerifiedSumToolGateway(proofTrust,'audit-reader'),log=createVerifiedToolAuditLog(proofTrust,auditTrust),requests=new Map(),records=[];
  for(const dataset of ['school','community']){
    const call=await gateway.begin(dataset), evidence=await createSignedSum([2,4,8],call.request,[prover]);
    const record=await attestVerifiedToolResult(dataset,call.request,evidence,proofTrust,[auditor]);
    requests.set(call.request.requestId,{datasetId:dataset,request:call.request});
    records.push({dataset,call,evidence,record});
  }
  return {log,requests,records,proofTrust,auditTrust};
}

test('concurrent verified append yields a re-verifiable chain and rejects duplicate request IDs', async () => {
  const f=await fixture();
  await Promise.all(f.records.map(x=>f.log.append(x.dataset,x.call.request,x.evidence,x.record)));
  const checkpoint=f.log.checkpoint(), snapshot=f.log.snapshot();
  assert.deepEqual(await verifyToolAuditLog(snapshot,checkpoint,f.requests,f.proofTrust,f.auditTrust),checkpoint);
  await assert.rejects(f.log.append(f.records[0].dataset,f.records[0].call.request,f.records[0].evidence,f.records[0].record));
  assert.deepEqual(f.log.checkpoint(),checkpoint);
  snapshot.entries[0].record.payload.sum++;
  assert.deepEqual(f.log.checkpoint(),checkpoint);
});

test('independent checkpoint and requests detect deletion, reordering, substitution and missing context', async () => {
  const f=await fixture();
  for(const x of f.records)await f.log.append(x.dataset,x.call.request,x.evidence,x.record);
  const checkpoint=f.log.checkpoint(), original=f.log.snapshot();
  const check=(log,requests=f.requests,head=checkpoint)=>verifyToolAuditLog(log,head,requests,f.proofTrust,f.auditTrust);
  const truncated=structuredClone(original);truncated.entries.pop();await assert.rejects(check(truncated));
  const reordered=structuredClone(original);reordered.entries.reverse();await assert.rejects(check(reordered));
  const changed=structuredClone(original);changed.entries[0].record.payload.sum++;await assert.rejects(check(changed));
  await assert.rejects(check(original,new Map()));
  await assert.rejects(check(original,f.requests,{...checkpoint,head:'0'.repeat(64)}));
});
