import assert from 'node:assert/strict';
import { makeSigningKey } from '../src/crypto.js';
import { createFHEOwner } from '../src/secure/fhe.js';
import { createFheRequest, createFheAggregateAttestation, verifyFheAggregateAttestation } from '../src/secure/fhe-attestation.js';

const owner=await createFHEOwner();
try {
  const keys=await Promise.all([makeSigningKey(),makeSigningKey()]);
  const trust={format:'sumi-fhe-decryptor-trust',version:1,threshold:2,publicKeys:await Promise.all(keys.map(k=>crypto.subtle.exportKey('jwk',k.publicKey)))};
  for(const [dataset,groups] of [['school',[[10,20],[30]]],['community',[[7,11],[12]]]]){
    const inputs=groups.map(values=>owner.encrypt(values));
    const request=await createFheRequest(inputs,dataset,'demo-verifier',crypto.randomUUID());
    const envelope=await createFheAggregateAttestation(owner,inputs,request,keys);
    const result=await verifyFheAggregateAttestation(envelope,inputs,request,trust);
    const modified=structuredClone(envelope);modified.payload.sum++;
    await assert.rejects(verifyFheAggregateAttestation(modified,inputs,request,trust));
    console.log(`${dataset}: BFV 暗号文を再加算し、${result.count} 件の合計 ${result.sum} に対する ${result.verifiedSignatures} 件の署名を検証。`);
  }
  console.log('元の入力値は検証側へ渡しません。暗号文加算は再計算しますが、復号値の正しさは署名者を信頼します。');
} finally {owner.destroy();}
