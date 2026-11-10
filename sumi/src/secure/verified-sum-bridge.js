import { canonical, hash } from '../crypto.js';
import { isWellFormedUnicode } from '../school-policy-contract.js';
import { proveCommittedSum, verifyCommittedSum } from './zk.js';
import { signQuorum, verifyQuorum } from './signature-quorum.js';

// Bridges a committed-sum proof and ordinary ECDSA signatures. The verifier
// provides its expected request and trust anchors independently; neither is
// learned from the untrusted envelope. No cross-protocol security is implied.
const ENVELOPE='sumi-verified-sum-bridge';
const REQUEST='sumi-sum-request';
const TRUST='sumi-sum-verifier-trust';
const DOMAIN='sumi/verified-sum-bridge/v1\n';
const CONTEXT='sumi-sum-request-sha256:';
const encoder=new TextEncoder();
const ownKeys=(object,keys)=>object && typeof object==='object' && !Array.isArray(object) && Object.keys(object).length===keys.length && keys.every(k=>Object.hasOwn(object,k));
const fail=()=>{throw new Error('合計証明、依頼または信頼設定が不正です。');};
function validateRequest(value){
  if(!ownKeys(value,['format','version','purpose','requestId','recipient'])||value.format!==REQUEST||value.version!==1||typeof value.purpose!=='string'||!value.purpose.trim()||value.purpose.length>120||!isWellFormedUnicode(value.purpose)||typeof value.recipient!=='string'||!value.recipient.trim()||value.recipient.length>120||!isWellFormedUnicode(value.recipient)||typeof value.requestId!=='string'||!/^[a-zA-Z0-9_-]{16,80}$/.test(value.requestId))fail();
  return value;
}
function validateTrust(trust){
  if(!ownKeys(trust,['format','version','threshold','publicKeys'])||trust.format!==TRUST||trust.version!==1)fail();
}
function validateProofShape(proof){
  if(!ownKeys(proof,['protocol','context','commitments','sum','R','response','count']))fail();
}
const contextFor=async request=>CONTEXT+await hash(canonical(request));
const signedBytes=payload=>encoder.encode(DOMAIN+canonical(payload));
function freeze(value){
  if(value&&typeof value==='object'&&!Object.isFrozen(value)){
    for(const item of Object.values(value))freeze(item);
    Object.freeze(value);
  }
  return value;
}

export async function createSignedSum(input,request,keyPairs){
  // Snapshot and validate before the first await. Only public proof material
  // goes into the payload; the original values are not included.
  const values=structuredClone(input),expected=validateRequest(structuredClone(request));
  const context=await contextFor(expected);
  const proof=proveCommittedSum(values,context);
  const payload={format:ENVELOPE,version:1,request:expected,proof};
  const signatures=await signQuorum(signedBytes(payload),keyPairs);
  return {payload,signatures};
}

export async function verifySignedSum(input,expectedRequest,trust){
  // Snapshot all untrusted and trusted inputs before any async verification.
  const envelope=structuredClone(input),expected=validateRequest(structuredClone(expectedRequest)),anchors=structuredClone(trust);
  if(!ownKeys(envelope,['payload','signatures'])||!ownKeys(envelope.payload,['format','version','request','proof'])||envelope.payload.format!==ENVELOPE||envelope.payload.version!==1)fail();
  validateTrust(anchors);
  const {request,proof}=envelope.payload;
  validateRequest(request);validateProofShape(proof);
  if(canonical(request)!==canonical(expected)||proof.context!==await contextFor(expected))fail();
  // A signature authenticates only the attestation; check the proof separately.
  if(!verifyCommittedSum(proof))fail();
  const quorum=await verifyQuorum(signedBytes(envelope.payload),envelope.signatures,anchors);
  return Object.freeze({request:freeze(request),sum:proof.sum,count:proof.count,...quorum});
}
