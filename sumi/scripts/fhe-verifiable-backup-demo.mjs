import { makeSigningKey } from '../src/crypto.js';
import { createFHEOwner, evaluateCiphertexts } from '../src/secure/fhe.js';
import { createVerifiableFheBackup, verifyFheBackupShare, restoreVerifiableFheBackup } from '../src/secure/fhe-verifiable-backup.js';

const owner=await createFHEOwner(),keys=await Promise.all([makeSigningKey(),makeSigningKey()]);
const trust={format:'sumi-fhe-backup-dealer-trust',version:1,threshold:2,publicKeys:await Promise.all(keys.map(k=>crypto.subtle.exportKey('jwk',k.publicKey)))};
const passwords={A:'fictional-guardian-A',B:'fictional-guardian-B',C:'fictional-guardian-C'};
try {
  const keyId=owner.keyId, aggregate=await evaluateCiphertexts([owner.encrypt([5,10,15])]);
  const {backup,shares,manifestHash}=await createVerifiableFheBackup(owner,passwords,keys);
  for(const party of ['A','B','C']) {
    await verifyFheBackupShare(backup,party,shares[party],passwords[party],manifestHash,keyId,trust);
    console.log(`${party}: 署名とシェアの整合性を検証`);
  }
  try {
    await restoreVerifiableFheBackup(backup,[{party:'A',envelope:shares.A,password:passwords.A}],manifestHash,keyId,trust);
    throw new Error('unexpected acceptance');
  } catch(error) { if(error.message==='unexpected acceptance')throw error; console.log('1人のみの復元要求: 拒否'); }
  owner.destroy();
  const restored=await restoreVerifiableFheBackup(backup,['A','C'].map(party=>({party,envelope:shares[party],password:passwords[party]})),manifestHash,keyId,trust);
  try { console.log('2人で復元した鍵による架空集計:',restored.decrypt(aggregate)); } finally { restored.destroy(); }
  console.log('これは鍵バックアップの分散復元であり、閾値復号やFHE計算のZK証明ではありません。');
} finally {owner.destroy();}
