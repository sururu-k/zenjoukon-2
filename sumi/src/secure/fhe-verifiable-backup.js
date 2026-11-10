import { ristretto255 } from '@noble/curves/ed25519.js';
import { canonical, hash, encryptDraft, decryptDraft } from '../crypto.js';
import { randomBelow } from './numeric.js';
import { signQuorum, verifyQuorum } from './signature-quorum.js';
import { restoreFHEOwner } from './fhe.js';

const P=ristretto255.Point,F=P.Fn,G=P.BASE, ids=Object.freeze({A:1n,B:2n,C:3n});
const own=(v,ks)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===ks.length&&ks.every(k=>Object.hasOwn(v,k));
const hex=v=>typeof v==='string'&&/^[0-9a-f]{64}$/.test(v);
const id=v=>typeof v==='string'&&/^[a-zA-Z0-9_-]{16,80}$/.test(v);
const fail=()=>{throw new Error('復旧条件、署名またはシェアが不正です。');};
const encode=n=>n.toString(16).padStart(64,'0');
const decode=s=>{if(!hex(s))fail();const n=BigInt('0x'+s);if(n>=F.ORDER)fail();return n;};
const multiply=(point,scalar)=>scalar===0n?P.ZERO:point.multiply(scalar);
const bytes=m=>new TextEncoder().encode('sumi/fhe-verifiable-backup-manifest/v1\n'+canonical(m));

// Feldman commitments reveal group elements of random coefficients: security
// against recovering them is computational, not information-theoretic.
// This prototype does not prove that the encrypted owner matches C0 until
// actual recovery and does not implement threshold BFV decryption.
export async function createVerifiableFheBackup(owner,inputPasswords,dealerKeys){
  const passwords=structuredClone(inputPasswords),keys=Array.isArray(dealerKeys)?dealerKeys.map(k=>({publicKey:k.publicKey,privateKey:k.privateKey})):dealerKeys;
  if(!owner||typeof owner.exportEncrypted!=='function'||!hex(owner.keyId)||!own(passwords,['A','B','C'])||Object.values(passwords).some(p=>typeof p!=='string'||[...p].length<12)||new Set(Object.values(passwords)).size!==3)fail();
  const keyId=owner.keyId,backupId=crypto.randomUUID(),secret=randomBelow(F.ORDER),coefficient=randomBelow(F.ORDER);
  const [encryptedOwner,pairs]=await Promise.all([owner.exportEncrypted(encode(secret)),Promise.all(Object.entries(ids).map(async([party,x])=>{
    const value=encode(F.add(secret,F.mul(coefficient,x)));
    return [party,await encryptDraft({format:'sumi-verifiable-fhe-share',version:1,backupId,keyId,party,value},passwords[party])];
  }))]);
  const shares=Object.fromEntries(pairs),shareDigests=Object.fromEntries(await Promise.all(Object.entries(shares).map(async([party,value])=>[party,await hash(canonical(value))])));
  const manifest={format:'sumi-verifiable-fhe-manifest',version:1,backupId,keyId,commitment0:multiply(G,secret).toHex(),commitment1:multiply(G,coefficient).toHex(),ownerDigest:await hash(canonical(encryptedOwner)),shareDigests};
  return {backup:{format:'sumi-verifiable-fhe-backup',version:1,manifest,signatures:await signQuorum(bytes(manifest),keys),encryptedOwner},shares,manifestHash:await hash(canonical(manifest))};
}

async function verifyManifest(inputBackup,expectedManifestHash,expectedKeyId,inputTrust){
  const backup=structuredClone(inputBackup),trust=structuredClone(inputTrust),m=backup?.manifest;
  if(!own(backup,['format','version','manifest','signatures','encryptedOwner'])||backup.format!=='sumi-verifiable-fhe-backup'||backup.version!==1||!own(m,['format','version','backupId','keyId','commitment0','commitment1','ownerDigest','shareDigests'])||m.format!=='sumi-verifiable-fhe-manifest'||m.version!==1||!id(m.backupId)||!hex(expectedKeyId)||m.keyId!==expectedKeyId||!hex(expectedManifestHash)||!hex(m.commitment0)||!hex(m.commitment1)||!hex(m.ownerDigest)||!own(m.shareDigests,['A','B','C'])||Object.values(m.shareDigests).some(v=>!hex(v))||!own(trust,['format','version','threshold','publicKeys'])||trust.format!=='sumi-fhe-backup-dealer-trust'||trust.version!==1)fail();
  if(await hash(canonical(m))!==expectedManifestHash||await hash(canonical(backup.encryptedOwner))!==m.ownerDigest)fail();
  await verifyQuorum(bytes(m),backup.signatures,trust);
  P.fromHex(m.commitment0);P.fromHex(m.commitment1);
  return backup;
}

async function openShare(backup,party,envelope,password){
  if(!Object.hasOwn(ids,party)||typeof password!=='string'||await hash(canonical(envelope))!==backup.manifest.shareDigests[party])fail();
  const share=await decryptDraft(envelope,password),m=backup.manifest;
  if(!own(share,['format','version','backupId','keyId','party','value'])||share.format!=='sumi-verifiable-fhe-share'||share.version!==1||share.backupId!==m.backupId||share.keyId!==m.keyId||share.party!==party)fail();
  const value=decode(share.value),expected=P.fromHex(m.commitment0).add(multiply(P.fromHex(m.commitment1),ids[party]));
  if(!multiply(G,value).equals(expected))fail();
  return value;
}

export async function verifyFheBackupShare(inputBackup,party,inputEnvelope,password,expectedManifestHash,expectedKeyId,trust){
  const envelope=structuredClone(inputEnvelope),backup=await verifyManifest(inputBackup,expectedManifestHash,expectedKeyId,trust);
  await openShare(backup,party,envelope,password);
  return Object.freeze({backupId:backup.manifest.backupId,keyId:expectedKeyId,party,valid:true});
}

export async function restoreVerifiableFheBackup(inputBackup,inputShares,expectedManifestHash,expectedKeyId,trust){
  const shares=structuredClone(inputShares);
  if(!Array.isArray(shares)||shares.length!==2||shares.some(s=>!own(s,['party','envelope','password']))||shares[0].party===shares[1].party||shares[0].password===shares[1].password)fail();
  const backup=await verifyManifest(inputBackup,expectedManifestHash,expectedKeyId,trust);
  const [y1,y2]=await Promise.all(shares.map(s=>openShare(backup,s.party,s.envelope,s.password)));
  const x1=ids[shares[0].party],x2=ids[shares[1].party];
  const secret=F.mul(F.sub(F.mul(y1,x2),F.mul(y2,x1)),F.inv(F.sub(x2,x1)));
  return restoreFHEOwner(backup.encryptedOwner,encode(secret),expectedKeyId);
}
