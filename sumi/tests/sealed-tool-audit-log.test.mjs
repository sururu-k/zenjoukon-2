import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeSigningKey } from '../src/crypto.js';
import { createSignedSum } from '../src/secure/verified-sum-bridge.js';
import { createVerifiedSumToolGateway } from '../src/secure/verified-tool-gateway.js';
import { attestVerifiedToolResult } from '../src/secure/tool-result-attestation.js';
import { createVerifiedToolAuditLog } from '../src/secure/verified-tool-audit-log.js';
import { sealToolAuditLog, openToolAuditLog } from '../src/secure/sealed-tool-audit-log.js';

test('encrypted audit file restores a separately verified log and supports future append', async () => {
  const prover=await makeSigningKey(), auditor=await makeSigningKey();
  const proofTrust={format:'sumi-sum-verifier-trust',version:1,threshold:1,publicKeys:[await crypto.subtle.exportKey('jwk',prover.publicKey)]};
  const auditTrust={format:'sumi-tool-audit-trust',version:1,threshold:1,publicKeys:[await crypto.subtle.exportKey('jwk',auditor.publicKey)]};
  const gateway=createVerifiedSumToolGateway(proofTrust,'audit-owner'), log=createVerifiedToolAuditLog(proofTrust,auditTrust), requests=new Map();
  async function entry(dataset) {
    const call=await gateway.begin(dataset), evidence=await createSignedSum([4,7,9],call.request,[prover]);
    const record=await attestVerifiedToolResult(dataset,call.request,evidence,proofTrust,[auditor]);
    requests.set(call.request.requestId,{datasetId:dataset,request:call.request});
    return {call,evidence,record};
  }
  const first=await entry('school');
  await log.append('school',first.call.request,first.evidence,first.record);
  const checkpoint=log.checkpoint(), passphrase='test-only-passphrase';
  const envelope=await sealToolAuditLog(log.snapshot(),checkpoint,requests,proofTrust,auditTrust,passphrase);
  assert.equal(JSON.stringify(envelope).includes('school'),false);
  const dir=await mkdtemp(join(tmpdir(),'sumi-audit-test-'));
  try {
    const path=join(dir,'audit.json');await writeFile(path,JSON.stringify(envelope),{mode:0o600,flag:'wx'});
    const stored=JSON.parse(await readFile(path,'utf8'));
    await assert.rejects(openToolAuditLog(stored,'wrong-passphrase',checkpoint,requests,proofTrust,auditTrust));
    await assert.rejects(openToolAuditLog(stored,passphrase,{...checkpoint,head:'0'.repeat(64)},requests,proofTrust,auditTrust));
    await assert.rejects(openToolAuditLog(stored,passphrase,checkpoint,new Map(),proofTrust,auditTrust));
    const changed=structuredClone(stored);changed.ciphertext=(changed.ciphertext[0]==='A'?'B':'A')+changed.ciphertext.slice(1);
    await assert.rejects(openToolAuditLog(changed,passphrase,checkpoint,requests,proofTrust,auditTrust));
    const restored=await openToolAuditLog(stored,passphrase,checkpoint,requests,proofTrust,auditTrust);
    assert.deepEqual(restored.checkpoint(),checkpoint);
    await assert.rejects(restored.append('school',first.call.request,first.evidence,first.record));
    const second=await entry('community');
    assert.equal((await restored.append('community',second.call.request,second.evidence,second.record)).size,2);
  } finally { await rm(dir,{recursive:true,force:true}); }
});
