import { canonical, keyFingerprint } from '../crypto.js';
import { validateSchoolPolicy } from '../school-policy-contract.js';

// Independent signatures, not threshold cryptography. Trust keys and quorum
// are supplied separately by the verifier; neither comes from the envelope.
const FORMAT='sumi-signed-school-policy';
const DOMAIN='sumi/signed-school-policy/v1\n';
const encoder=new TextEncoder();
const ownKeys=(object,keys)=>object && typeof object==='object' && !Array.isArray(object) && Object.keys(object).length===keys.length && keys.every(k=>Object.hasOwn(object,k));
const invalid=()=>{throw new Error('署名付き学校設定または信頼設定が不正です。');};
const to64=bytes=>btoa(String.fromCharCode(...bytes));
function from64(value){
  if(typeof value!=='string'||!/^[A-Za-z0-9+/]{86}==$/.test(value))invalid();
  const raw=Uint8Array.from(atob(value),c=>c.charCodeAt(0));
  if(raw.length!==64||to64(raw)!==value)invalid();
  return raw;
}
function policySnapshot(input){
  return validateSchoolPolicy(structuredClone(input));
}
function signingBytes(policy){return encoder.encode(DOMAIN+canonical(policy));}

export async function signSchoolPolicy(input, keyPairs){
  const policy=policySnapshot(input);
  if(!Array.isArray(keyPairs)||keyPairs.length<1||keyPairs.length>10)invalid();
  const bytes=signingBytes(policy),signatures=[],seen=new Set();
  for(const pair of keyPairs){
    const publicKey=await crypto.subtle.exportKey('jwk',pair.publicKey);
    const keyId=await keyFingerprint(publicKey);
    if(seen.has(keyId))invalid();seen.add(keyId);
    const signature=await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},pair.privateKey,bytes);
    if(signature.byteLength!==64)invalid();
    signatures.push({keyId,signature:to64(new Uint8Array(signature))});
  }
  return {format:FORMAT,version:1,policy,signatures};
}

export async function verifySchoolPolicy(envelope,trust){
  // Snapshot both inputs before any await so getters or concurrent mutation
  // cannot replace the policy or trust anchors while signatures are checked.
  const signed=structuredClone(envelope), anchors=structuredClone(trust);
  if(!ownKeys(signed,['format','version','policy','signatures'])||signed.format!==FORMAT||signed.version!==1||!Array.isArray(signed.signatures)||signed.signatures.length<1||signed.signatures.length>10)invalid();
  if(!ownKeys(anchors,['format','version','threshold','publicKeys'])||anchors.format!=='sumi-school-policy-trust'||anchors.version!==1||!Array.isArray(anchors.publicKeys)||anchors.publicKeys.length<1||anchors.publicKeys.length>10||!Number.isInteger(anchors.threshold)||anchors.threshold<1||anchors.threshold>anchors.publicKeys.length)invalid();
  const policy=policySnapshot(signed.policy),bytes=signingBytes(policy),trusted=new Map();
  for(const jwk of anchors.publicKeys){
    if(!jwk||jwk.kty!=='EC'||jwk.crv!=='P-256'||typeof jwk.x!=='string'||typeof jwk.y!=='string'||Object.hasOwn(jwk,'d'))invalid();
    const keyId=await keyFingerprint(jwk);
    if(trusted.has(keyId))invalid();
    trusted.set(keyId,await crypto.subtle.importKey('jwk',jwk,{name:'ECDSA',namedCurve:'P-256'},false,['verify']));
  }
  const seen=new Set();let verified=0;
  for(const item of signed.signatures){
    if(!ownKeys(item,['keyId','signature'])||typeof item.keyId!=='string'||!/^[0-9a-f]{64}$/.test(item.keyId)||seen.has(item.keyId))invalid();
    seen.add(item.keyId);const key=trusted.get(item.keyId);
    // Every provided signer must be trusted and valid; do not silently accept
    // unrecognized or corrupted endorsements alongside a valid quorum.
    if(!key||!await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},key,from64(item.signature),bytes))invalid();
    verified++;
  }
  if(verified<anchors.threshold)invalid();
  return Object.freeze({policy,verifiedSignatures:verified,threshold:anchors.threshold});
}
