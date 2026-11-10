import test from 'node:test';
import assert from 'node:assert/strict';
import { decryptDraft, encryptDraft } from '../src/crypto.js';
import { createFHEOwner, evaluateCiphertexts } from '../src/secure/fhe.js';
import { createFheThreePartyBackup, restoreFheThreePartyBackup } from '../src/secure/fhe-three-party-backup.js';

test('any two of three independent encrypted shares can restore the same BFV key', async () => {
  const owner=await createFHEOwner(),passwords={A:'fictional-guardian-A',B:'fictional-guardian-B',C:'fictional-guardian-C'};
  try {
    const total=await evaluateCiphertexts([owner.encrypt([5,10,15])]),id=owner.keyId;
    await assert.rejects(createFheThreePartyBackup(owner,{...passwords,C:passwords.A}));
    const saved=await createFheThreePartyBackup(owner,passwords),backupId=saved.backup.backupId;
    const input=party=>({envelope:saved.shares[party],password:passwords[party]});
    await assert.rejects(restoreFheThreePartyBackup(saved.backup,[input('A')],id,backupId));
    await assert.rejects(restoreFheThreePartyBackup(saved.backup,[input('A'),input('A')],id,backupId));
    await assert.rejects(restoreFheThreePartyBackup(saved.backup,[input('A'),input('B')],'0'.repeat(64),backupId));
    const other=await createFheThreePartyBackup(owner,passwords);
    await assert.rejects(restoreFheThreePartyBackup(saved.backup,[input('A'),{envelope:other.shares.B,password:passwords.B}],id,backupId));
    const opened=await decryptDraft(saved.shares.B,passwords.B);
    const replacement=opened.value==='0'.repeat(64)?'0'.repeat(63)+'1':'0'.repeat(64);
    const changed=await encryptDraft({...opened,value:replacement},passwords.B);
    await assert.rejects(restoreFheThreePartyBackup(saved.backup,[input('A'),{envelope:changed,password:passwords.B}],id,backupId));
    owner.destroy();
    for(const [a,b] of [['A','B'],['A','C'],['C','B']]){
      const restored=await restoreFheThreePartyBackup(saved.backup,[input(a),input(b)],id,backupId);
      try{assert.deepEqual(restored.decrypt(total),{count:3,sum:30,mean:10});}finally{restored.destroy();}
    }
  } finally {owner.destroy();}
});
