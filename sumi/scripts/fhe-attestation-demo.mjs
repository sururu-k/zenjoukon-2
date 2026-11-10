import assert from 'node:assert/strict';
import { makeSigningKey } from '../src/crypto.js';
import { createFHEOwner, createFHEEncryptor } from '../src/secure/fhe.js';
import { createFheRoundVerifierSession } from '../src/secure/verified-fhe-round.js';
import { signFheContribution, verifyFheContributions } from '../src/secure/signed-fhe-contributions.js';
import { createContributorFheGate } from '../src/secure/contributor-fhe-gate.js';

const owner=await createFHEOwner();
try {
  const keys=await Promise.all([makeSigningKey(),makeSigningKey()]);
  const trust={format:'sumi-fhe-decryptor-trust',version:1,threshold:2,publicKeys:await Promise.all(keys.map(k=>crypto.subtle.exportKey('jwk',k.publicKey)))};
  const publicKey=owner.exportPublicKey();
  const memberKeys=await Promise.all([makeSigningKey(),makeSigningKey(),makeSigningKey()]);
  const roster=await Promise.all(memberKeys.map(async (key,i)=>({participantId:`member${i+1}`,publicKey:await crypto.subtle.exportKey('jwk',key.publicKey)})));
  for(const [dataset,groups] of [['school',[[10],[20],[30]]],['community',[[7],[11],[12]]]]){
    const contributors=await Promise.all(groups.map(()=>createFHEEncryptor(publicKey,owner.keyId)));
    let inputs;
    try{inputs=groups.map((values,i)=>contributors[i].encrypt(values));}finally{contributors.forEach(contributor=>contributor.destroy());}
    const round={format:'sumi-fhe-round',version:1,roundId:crypto.randomUUID(),datasetId:dataset,recipient:'demo-verifier',keyId:owner.keyId};
    const bundles=await Promise.all(inputs.map((packet,i)=>signFheContribution(packet,round,roster[i].participantId,memberKeys[i])));
    const checked=await verifyFheContributions(bundles,round,roster);
    const gate=createContributorFheGate({owner,signingKeys:keys,expectedRound:round,participants:roster});
    assert.equal((await gate.agent.execute('unapproved-request')).status,'denied');
    const request=await gate.approve(bundles); // simulated owner approval
    const accepted=await gate.agent.execute(request.requestId);
    assert.equal(accepted.status,'completed');
    const envelope=accepted.envelope;
    assert.equal((await gate.agent.execute(request.requestId)).status,'denied');
    const session=createFheRoundVerifierSession(round,request,roster,trust);
    const modified=structuredClone(envelope);modified.payload.sum++;
    await assert.rejects(session.verifyAndConsume({contributions:bundles,attestation:modified}));
    const result=await session.verifyAndConsume({contributions:bundles,attestation:envelope});
    await assert.rejects(session.verifyAndConsume({contributions:bundles,attestation:envelope}));
    console.log(`${dataset}: ${checked.participants} 件の入力署名、BFV 暗号文の再加算、合計 ${result.sum} に対する ${result.verifiedSignatures} 件の署名を検証。`);
  }
  console.log('事前に確認した入力と受取先だけを一度復号。各入力者は公開鍵だけで暗号化します（同一プロセスの模擬）。復号値の正しさは署名者を信頼します。');
} finally {owner.destroy();}
