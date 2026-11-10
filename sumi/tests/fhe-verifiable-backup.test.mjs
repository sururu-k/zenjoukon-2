import test from 'node:test';
import assert from 'node:assert/strict';
import { canonical, decryptDraft, encryptDraft, hash, makeSigningKey } from '../src/crypto.js';
import { signQuorum } from '../src/secure/signature-quorum.js';
import { createFHEOwner, evaluateCiphertexts } from '../src/secure/fhe.js';
import { createVerifiableFheBackup, verifyFheBackupShare, restoreVerifiableFheBackup } from '../src/secure/fhe-verifiable-backup.js';

test('signed commitments validate shares before any two restore the BFV owner', async () => {
  const owner=await createFHEOwner(), keys=await Promise.all([makeSigningKey(),makeSigningKey()]);
  const trust={format:'sumi-fhe-backup-dealer-trust',version:1,threshold:2,publicKeys:await Promise.all(keys.map(k=>crypto.subtle.exportKey('jwk',k.publicKey)))};
  const passwords={A:'fictional-guardian-A',B:'fictional-guardian-B',C:'fictional-guardian-C'};
  try {
    const total=await evaluateCiphertexts([owner.encrypt([5,10,15])]), keyId=owner.keyId;
    const {backup,shares,manifestHash}=await createVerifiableFheBackup(owner,passwords,keys);
    const input=party=>({party,envelope:shares[party],password:passwords[party]});
    for (const party of ['A','B','C']) assert.equal((await verifyFheBackupShare(backup,party,shares[party],passwords[party],manifestHash,keyId,trust)).valid,true);
    await assert.rejects(verifyFheBackupShare(backup,'A',shares.B,passwords.B,manifestHash,keyId,trust));
    await assert.rejects(verifyFheBackupShare(backup,'A',shares.A,'incorrect-password',manifestHash,keyId,trust));
    await assert.rejects(restoreVerifiableFheBackup(backup,[input('A')],manifestHash,keyId,trust));
    await assert.rejects(restoreVerifiableFheBackup(backup,[input('A'),input('A')],manifestHash,keyId,trust));
    await assert.rejects(restoreVerifiableFheBackup(backup,[input('A'),input('B')],'0'.repeat(64),keyId,trust));
    const changed=structuredClone(backup);changed.signatures.pop();
    await assert.rejects(verifyFheBackupShare(changed,'A',shares.A,passwords.A,manifestHash,keyId,trust));

    // Even a manifest correctly signed by the dealer cannot make a share
    // inconsistent with the committed polynomial pass verification.
    const opened=await decryptDraft(shares.B,passwords.B);
    const badValue=opened.value==='0'.repeat(64)?'0'.repeat(63)+'1':'0'.repeat(64);
    const badShare=await encryptDraft({...opened,value:badValue},passwords.B);
    const malicious=structuredClone(backup);
    malicious.manifest.shareDigests.B=await hash(canonical(badShare));
    const message=new TextEncoder().encode('sumi/fhe-verifiable-backup-manifest/v1\n'+canonical(malicious.manifest));
    malicious.signatures=await signQuorum(message,keys);
    const maliciousHash=await hash(canonical(malicious.manifest));
    await assert.rejects(verifyFheBackupShare(malicious,'B',badShare,passwords.B,maliciousHash,keyId,trust));

    owner.destroy();
    for (const pair of [['A','B'],['A','C'],['B','C']]) {
      const restored=await restoreVerifiableFheBackup(backup,pair.map(input),manifestHash,keyId,trust);
      try { assert.deepEqual(restored.decrypt(total),{count:3,sum:30,mean:10}); } finally { restored.destroy(); }
    }
  } finally { owner.destroy(); }
});
