import test from 'node:test';
import assert from 'node:assert/strict';
import { makeSigningKey } from '../src/crypto.js';
import { createFHEOwner, createFHEEncryptor } from '../src/secure/fhe.js';
import { createFheDecryptionGate } from '../src/secure/fhe-decryption-gate.js';
import { verifyFheAggregateAttestation } from '../src/secure/fhe-attestation.js';

test('approved ciphertexts and recipient are required before a single decryption', async () => {
  const owner=await createFHEOwner(), key=await makeSigningKey();
  let decryptions=0, contributor;
  try {
    const guardedOwner={keyId:owner.keyId,decrypt(total){decryptions++;return owner.decrypt(total);}};
    const gate=createFheDecryptionGate({owner:guardedOwner,signingKeys:[key],datasets:['school'],recipients:['auditor']});
    const trust={format:'sumi-fhe-decryptor-trust',version:1,threshold:1,publicKeys:[await crypto.subtle.exportKey('jwk',key.publicKey)]};
    contributor=await createFHEEncryptor(owner.exportPublicKey(),owner.keyId);
    const inputs=[contributor.encrypt([4,8]),contributor.encrypt([12])];
    assert.equal((await gate.agent.execute('no-approval',inputs)).status,'denied');assert.equal(decryptions,0);
    await assert.rejects(gate.approve(inputs,'school','other'));
    await assert.rejects(gate.approve([contributor.encrypt([1,2])],'school','auditor'));
    const first=await gate.approve(inputs,'school','auditor');
    const changed=[inputs[0],contributor.encrypt([13])];
    assert.equal((await gate.agent.execute(first.requestId,changed)).status,'denied');assert.equal(decryptions,0);
    assert.equal((await gate.agent.execute(first.requestId,inputs)).status,'denied');
    const approved=await gate.approve(inputs,'school','auditor');
    const attempts=await Promise.all([gate.agent.execute(approved.requestId,inputs),gate.agent.execute(approved.requestId,inputs)]);
    assert.equal(attempts.filter(x=>x.status==='completed').length,1);
    assert.equal(decryptions,1);
    const result=await verifyFheAggregateAttestation(attempts.find(x=>x.status==='completed').envelope,inputs,approved,trust);
    assert.equal(result.sum,24);
    assert.equal((await gate.agent.execute(approved.requestId,inputs)).status,'denied');
    const cancelled=await gate.approve(inputs,'school','auditor');
    const pending=gate.agent.execute(cancelled.requestId,inputs);gate.cancel();
    assert.equal((await pending).status,'denied');assert.equal(decryptions,1);
  } finally {contributor?.destroy();owner.destroy();}
});
