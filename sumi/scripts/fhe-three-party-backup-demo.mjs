import assert from 'node:assert/strict';
import { createFHEOwner, evaluateCiphertexts } from '../src/secure/fhe.js';
import { createFheThreePartyBackup, restoreFheThreePartyBackup } from '../src/secure/fhe-three-party-backup.js';

let owner=await createFHEOwner();
try {
  const total=await evaluateCiphertexts([owner.encrypt([10,20,30])]),keyId=owner.keyId;
  const passwords={A:'fictional-guardian-A',B:'fictional-guardian-B',C:'fictional-guardian-C'};
  const saved=await createFheThreePartyBackup(owner,passwords),backupId=saved.backup.backupId;
  owner.destroy();owner=null;
  for(const [a,b] of [['A','B'],['A','C'],['B','C']]){
    const shares=[a,b].map(party=>({envelope:saved.shares[party],password:passwords[party]}));
    const restored=await restoreFheThreePartyBackup(saved.backup,shares,keyId,backupId);
    try {const result=restored.decrypt(total);assert.equal(result.sum,60);console.log(`${a} と ${b} で復元：架空の ${result.count} 件・合計 ${result.sum}。`);} finally {restored.destroy();}
  }
  await assert.rejects(restoreFheThreePartyBackup(saved.backup,[{envelope:saved.shares.A,password:passwords.A}],keyId,backupId));
  console.log('１シェアだけでは復旧できません。復元時は同一プロセスに秘密鍵が揃い、閾値復号ではありません。');
} finally {owner?.destroy();}
