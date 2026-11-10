import test from 'node:test';
import assert from 'node:assert/strict';
import { makeSigningKey } from '../src/crypto.js';
import { createFHEOwner } from '../src/secure/fhe.js';
import { createFheRequest, createFheAggregateAttestation, verifyFheAggregateAttestation } from '../src/secure/fhe-attestation.js';
import { canonical } from '../src/crypto.js';
import { signQuorum } from '../src/secure/signature-quorum.js';

test('verifier recomputes encrypted addition and checks independent decryptor signatures', async () => {
  const owner=await createFHEOwner();
  try {
    const keys=await Promise.all([makeSigningKey(),makeSigningKey()]);
    const trust={format:'sumi-fhe-decryptor-trust',version:1,threshold:2,publicKeys:await Promise.all(keys.map(k=>crypto.subtle.exportKey('jwk',k.publicKey)))};
    const inputs=[owner.encrypt([10,20]),owner.encrypt([30])];
    const request=await createFheRequest(inputs,'school','auditor',crypto.randomUUID());
    const envelope=await createFheAggregateAttestation(owner,inputs,request,keys);
    const result=await verifyFheAggregateAttestation(envelope,inputs,request,trust);
    assert.deepEqual(result,{datasetId:'school',requestId:request.requestId,sum:60,count:3,verifiedSignatures:2,guarantee:'recomputed-bfv-addition-trusted-decryption'});
    const changed=structuredClone(envelope);changed.payload.sum++;
    await assert.rejects(verifyFheAggregateAttestation(changed,inputs,request,trust));
    // Even trusted signatures over a substituted encrypted total cannot pass
    // the verifier's independent ciphertext addition.
    const substituted=structuredClone(envelope);
    substituted.payload.encryptedTotal.ciphertext=owner.encrypt([1,2,3]).ciphertext;
    substituted.signatures=await signQuorum(new TextEncoder().encode('sumi/fhe-aggregate-attestation/v1\n'+canonical(substituted.payload)),keys);
    await assert.rejects(verifyFheAggregateAttestation(substituted,inputs,request,trust));
    // In contrast, dishonest trusted signers can lie about the plaintext:
    // no ZK proof of BFV decryption is implemented by this bridge.
    const dishonest=structuredClone(envelope);dishonest.payload.sum=61;
    dishonest.signatures=await signQuorum(new TextEncoder().encode('sumi/fhe-aggregate-attestation/v1\n'+canonical(dishonest.payload)),keys);
    assert.equal((await verifyFheAggregateAttestation(dishonest,inputs,request,trust)).sum,61);
    await assert.rejects(verifyFheAggregateAttestation(envelope,inputs,{...request,datasetId:'community'},trust));
    await assert.rejects(verifyFheAggregateAttestation(envelope,inputs.slice(0,1),request,trust));
    const wrong=await makeSigningKey();
    await assert.rejects(verifyFheAggregateAttestation(envelope,inputs,request,{...trust,publicKeys:[trust.publicKeys[0],await crypto.subtle.exportKey('jwk',wrong.publicKey)]}));
    await assert.rejects(createFheRequest([inputs[0],inputs[0]],'school','auditor',crypto.randomUUID()));
  } finally { owner.destroy(); }
});
