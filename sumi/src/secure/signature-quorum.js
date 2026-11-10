import { keyFingerprint } from '../crypto.js';

// A quorum of independent ECDSA signatures. This is not threshold signing.
const invalid=()=>{throw new Error('署名または信頼設定が不正です。');};
const ownKeys=(object,keys)=>object && typeof object==='object' && !Array.isArray(object) && Object.keys(object).length===keys.length && keys.every(k=>Object.hasOwn(object,k));
const to64=bytes=>btoa(String.fromCharCode(...bytes));
function from64(value){
  if(typeof value!=='string'||!/^[A-Za-z0-9+/]{86}==$/.test(value))invalid();
  const raw=Uint8Array.from(atob(value),c=>c.charCodeAt(0));
  if(raw.length!==64||to64(raw)!==value)invalid();
  return raw;
}
export async function signQuorum(bytes,keyPairs){
  if(!(bytes instanceof Uint8Array)||!Array.isArray(keyPairs)||keyPairs.length<1||keyPairs.length>10)invalid();
  // Never rely on caller-controlled mutable bytes after an asynchronous call.
  const message=Uint8Array.from(bytes),signatures=[],seen=new Set();
  for(const pair of keyPairs){
    const publicKey=await crypto.subtle.exportKey('jwk',pair.publicKey);
    const keyId=await keyFingerprint(publicKey);
    if(seen.has(keyId))invalid();seen.add(keyId);
    const signature=await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},pair.privateKey,message);
    if(signature.byteLength!==64)invalid();
    signatures.push({keyId,signature:to64(new Uint8Array(signature))});
  }
  return signatures;
}
export async function verifyQuorum(bytes,items,trust){
  // The trust format is chosen by the caller, not by the signed artifact.
  if(!(bytes instanceof Uint8Array))invalid();
  const message=Uint8Array.from(bytes),signatures=structuredClone(items),anchors=structuredClone(trust);
  if(!Array.isArray(signatures)||signatures.length<1||signatures.length>10||!anchors||!Array.isArray(anchors.publicKeys)||anchors.publicKeys.length<1||anchors.publicKeys.length>10||!Number.isInteger(anchors.threshold)||anchors.threshold<1||anchors.threshold>anchors.publicKeys.length)invalid();
  const trusted=new Map();
  for(const jwk of anchors.publicKeys){
    if(!jwk||jwk.kty!=='EC'||jwk.crv!=='P-256'||typeof jwk.x!=='string'||typeof jwk.y!=='string'||Object.hasOwn(jwk,'d'))invalid();
    const keyId=await keyFingerprint(jwk);
    if(trusted.has(keyId))invalid();
    trusted.set(keyId,await crypto.subtle.importKey('jwk',jwk,{name:'ECDSA',namedCurve:'P-256'},false,['verify']));
  }
  const seen=new Set();let verified=0;
  for(const item of signatures){
    if(!ownKeys(item,['keyId','signature'])||typeof item.keyId!=='string'||!/^[0-9a-f]{64}$/.test(item.keyId)||seen.has(item.keyId))invalid();
    seen.add(item.keyId);const key=trusted.get(item.keyId);
    if(!key||!await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},key,from64(item.signature),message))invalid();
    verified++;
  }
  if(verified<anchors.threshold)invalid();
  return Object.freeze({verifiedSignatures:verified,threshold:anchors.threshold});
}
