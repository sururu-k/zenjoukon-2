import { encryptDraft, decryptDraft } from '../crypto.js';
import { restoreFHEOwner } from './fhe.js';

const own=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const validKeyId=v=>typeof v==='string'&&/^[0-9a-f]{64}$/.test(v);
const validBackupId=v=>typeof v==='string'&&/^[a-zA-Z0-9_-]{16,80}$/.test(v);
const fail=()=>{throw new Error('復旧ファイル、担当者または期待する識別子が不正です。');};
const toHex=bytes=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
const fromHex=s=>Uint8Array.from(s.match(/../g),v=>parseInt(v,16));

// 2-of-2 XOR sharing of a random backup passphrase, not threshold BFV
// decryption. Both shares and the complete BFV secret are reunited locally.
export async function createFheTwoPartyBackup(owner,passwordA,passwordB){
  if(!owner||typeof owner.exportEncrypted!=='function'||!validKeyId(owner.keyId)||typeof passwordA!=='string'||typeof passwordB!=='string'||[...passwordA].length<12||[...passwordB].length<12||passwordA===passwordB)fail();
  const keyId=owner.keyId,backupId=crypto.randomUUID();
  const secret=crypto.getRandomValues(new Uint8Array(32)),a=crypto.getRandomValues(new Uint8Array(32)),b=Uint8Array.from(secret,(v,i)=>v^a[i]);
  try {
    const share=(party,value)=>({format:'sumi-fhe-backup-share',version:1,backupId,keyId,party,value:toHex(value)});
    const [encryptedOwner,shareA,shareB]=await Promise.all([
      owner.exportEncrypted(toHex(secret)),encryptDraft(share('A',a),passwordA),encryptDraft(share('B',b),passwordB)
    ]);
    return {backup:{format:'sumi-fhe-two-party-backup',version:1,backupId,keyId,encryptedOwner},shareA,shareB};
  } finally {secret.fill(0);a.fill(0);b.fill(0);}
}

export async function restoreFheTwoPartyBackup(inputBackup,inputShareA,passwordA,inputShareB,passwordB,expectedKeyId,expectedBackupId){
  const backup=structuredClone(inputBackup),sealedA=structuredClone(inputShareA),sealedB=structuredClone(inputShareB);
  if(!validKeyId(expectedKeyId)||!validBackupId(expectedBackupId)||!own(backup,['format','version','backupId','keyId','encryptedOwner'])||backup.format!=='sumi-fhe-two-party-backup'||backup.version!==1||backup.keyId!==expectedKeyId||backup.backupId!==expectedBackupId||typeof passwordA!=='string'||typeof passwordB!=='string'||passwordA===passwordB)fail();
  const [a,b]=await Promise.all([decryptDraft(sealedA,passwordA),decryptDraft(sealedB,passwordB)]);
  const valid=(s,party)=>own(s,['format','version','backupId','keyId','party','value'])&&s.format==='sumi-fhe-backup-share'&&s.version===1&&s.backupId===expectedBackupId&&s.keyId===expectedKeyId&&s.party===party&&typeof s.value==='string'&&/^[0-9a-f]{64}$/.test(s.value);
  if(!valid(a,'A')||!valid(b,'B'))fail();
  const x=fromHex(a.value),y=fromHex(b.value),secret=Uint8Array.from(x,(v,i)=>v^y[i]);
  try {return await restoreFHEOwner(backup.encryptedOwner,toHex(secret),expectedKeyId);}
  finally {x.fill(0);y.fill(0);secret.fill(0);}
}
