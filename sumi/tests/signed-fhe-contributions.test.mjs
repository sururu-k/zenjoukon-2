import test from 'node:test';
import assert from 'node:assert/strict';
import { makeSigningKey } from '../src/crypto.js';
import { createFHEOwner, createFHEEncryptor } from '../src/secure/fhe.js';
import { signFheContribution, verifyFheContributions } from '../src/secure/signed-fhe-contributions.js';
import { createContributorFheGate } from '../src/secure/contributor-fhe-gate.js';
import { verifyFheAggregateAttestation } from '../src/secure/fhe-attestation.js';

test('only the expected signed contributors can enter an approved BFV aggregate', async () => {
  const owner=await createFHEOwner(), contributor=await createFHEEncryptor(owner.exportPublicKey(),owner.keyId);
  try {
    const keys=await Promise.all([makeSigningKey(),makeSigningKey(),makeSigningKey()]), signer=await makeSigningKey();
    const participants=await Promise.all(keys.map(async (k,i)=>({participantId:`member${i}`,publicKey:await crypto.subtle.exportKey('jwk',k.publicKey)})));
    const round={format:'sumi-fhe-round',version:1,roundId:crypto.randomUUID(),datasetId:'school',recipient:'auditor',keyId:owner.keyId};
    const packets=[1,2,3].map(n=>contributor.encrypt([n]));
    const bundles=await Promise.all(packets.map((p,i)=>signFheContribution(p,round,participants[i].participantId,keys[i])));
    const verified=await verifyFheContributions(bundles,round,participants);
    assert.equal(verified.participants,3);
    await assert.rejects(verifyFheContributions(bundles.slice(1),round,participants));
    await assert.rejects(verifyFheContributions([bundles[0],bundles[0],bundles[2]],round,participants));
    await assert.rejects(verifyFheContributions(bundles,{...round,roundId:crypto.randomUUID()},participants));
    const altered=structuredClone(bundles);altered[0].payload.packet=packets[1];
    await assert.rejects(verifyFheContributions(altered,round,participants));
    const shared=structuredClone(participants);shared[1].publicKey=shared[0].publicKey;
    await assert.rejects(verifyFheContributions(bundles,round,shared));
    const gate=createContributorFheGate({owner,signingKeys:[signer],expectedRound:round,participants});
    assert.equal((await gate.agent.execute('unapproved')).status,'denied');
    await assert.rejects(gate.approve(altered));
    const request=await gate.approve(bundles);
    const calls=await Promise.all([gate.agent.execute(request.requestId),gate.agent.execute(request.requestId)]);
    assert.equal(calls.filter(x=>x.status==='completed').length,1);
    const trust={format:'sumi-fhe-decryptor-trust',version:1,threshold:1,publicKeys:[await crypto.subtle.exportKey('jwk',signer.publicKey)]};
    assert.equal((await verifyFheAggregateAttestation(calls.find(x=>x.status==='completed').envelope,verified.packets,request,trust)).sum,6);
    const cancelled=await gate.approve(bundles);gate.cancel();
    assert.equal((await gate.agent.execute(cancelled.requestId)).status,'denied');
  } finally {contributor.destroy();owner.destroy();}
});
