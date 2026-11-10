import { ristretto255 } from '@noble/curves/ed25519.js';
import { encryptDraft, decryptDraft } from '../crypto.js';
import { randomBelow } from './numeric.js';
import { restoreFHEOwner } from './fhe.js';

const F=ristretto255.Point.Fn, ids=Object.freeze({A:1n,B:2n,C:3n});
const own=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const validKey=v=>typeof v==='string'&&/^[0-9a-f]{64}$/.test(v);
const validId=v=>typeof v==='string'&&/^[a-zA-Z0-9_-]{16,80}$/.test(v);
const fail=()=>{throw new Error('復旧ファイル、担当者または期待する識別子が不正です。');};
const encode=n=>n.toString(16).padStart(64,'0');
const decode=s=>{if(typeof s!=='string'||!/^[0-9a-f]{64}$/.test(s))fail();const n=BigInt('0x'+s);if(n>=F.ORDER)fail();return n;};

// 2-of-3 degree-one sharing over the Ristretto scalar field. This shares the
// backup passphrase, not the BFV key for threshold decryption. BigInts and
// strings cannot be reliably wiped in JavaScript; this prototype is unaudited.
export async function createFheThreePartyBackup(owner,inputPasswords){
  const passwords=structuredClone(inputPasswords);
  if(!owner||typeof owner.exportEncrypted!=='function'||!validKey(owner.keyId)||!own(passwords,['A','B','C'])||Object.values(passwords).some(p=>typeof p!=='string'||[...p].length<12)||new Set(Object.values(passwords)).size!==3)fail();
  const keyId=owner.keyId,backupId=crypto.randomUUID(),secret=randomBelow(F.ORDER),coefficient=randomBelow(F.ORDER);
  const jobs=Object.entries(ids).map(async([party,x])=>{
    const value=F.add(secret,F.mul(coefficient,x));
    const share={format:'sumi-fhe-three-party-share',version:1,backupId,keyId,party,value:encode(value)};
    return [party,await encryptDraft(share,passwords[party])];
  });
  const [encryptedOwner,pairs]=await Promise.all([owner.exportEncrypted(encode(secret)),Promise.all(jobs)]);
  return {backup:{format:'sumi-fhe-three-party-backup',version:1,backupId,keyId,encryptedOwner},shares:Object.fromEntries(pairs)};
}

export async function restoreFheThreePartyBackup(inputBackup,inputShares,expectedKeyId,expectedBackupId){
  const backup=structuredClone(inputBackup),shares=structuredClone(inputShares);
  if(!validKey(expectedKeyId)||!validId(expectedBackupId)||!own(backup,['format','version','backupId','keyId','encryptedOwner'])||backup.format!=='sumi-fhe-three-party-backup'||backup.version!==1||backup.keyId!==expectedKeyId||backup.backupId!==expectedBackupId||!Array.isArray(shares)||shares.length!==2||shares.some(s=>!own(s,['envelope','password'])||typeof s.password!=='string')||shares[0].password===shares[1].password)fail();
  const opened=await Promise.all(shares.map(s=>decryptDraft(s.envelope,s.password)));
  const valid=s=>own(s,['format','version','backupId','keyId','party','value'])&&s.format==='sumi-fhe-three-party-share'&&s.version===1&&s.backupId===expectedBackupId&&s.keyId===expectedKeyId&&Object.hasOwn(ids,s.party);
  if(!opened.every(valid)||opened[0].party===opened[1].party)fail();
  const x1=ids[opened[0].party],x2=ids[opened[1].party],y1=decode(opened[0].value),y2=decode(opened[1].value);
  const secret=F.mul(F.sub(F.mul(y1,x2),F.mul(y2,x1)),F.inv(F.sub(x2,x1)));
  return restoreFHEOwner(backup.encryptedOwner,encode(secret),expectedKeyId);
}
