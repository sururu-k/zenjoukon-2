import { canonical, hash } from '../crypto.js';
import { signQuorum, verifyQuorum } from './signature-quorum.js';

const own=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const fail=()=>{throw new Error('署名付き期待条件または信頼設定が不正です。');};
const bytes=context=>new TextEncoder().encode('sumi/signed-fhe-context/v1\n'+canonical(context));
function snapshot(input){
  const c=structuredClone(input), r=c?.round, q=c?.request, t=c?.decryptorTrust;
  if(!own(c,['format','version','round','request','participants','decryptorTrust'])||c.format!=='sumi-fhe-verification-context'||c.version!==1||!own(r,['format','version','roundId','datasetId','recipient','keyId'])||r.format!=='sumi-fhe-round'||r.version!==1||!own(q,['format','version','datasetId','recipient','requestId','keyId','inputDigest','count'])||q.format!=='sumi-fhe-request'||q.version!==1||q.requestId!==r.roundId||q.datasetId!==r.datasetId||q.recipient!==r.recipient||q.keyId!==r.keyId||typeof q.inputDigest!=='string'||!/^[0-9a-f]{64}$/.test(q.inputDigest)||!Number.isInteger(q.count)||q.count<3||q.count>1000||!Array.isArray(c.participants)||c.participants.length<3||c.participants.length>50||!own(t,['format','version','threshold','publicKeys'])||t.format!=='sumi-fhe-decryptor-trust'||t.version!==1)fail();
  return c;
}
function freeze(v){if(v&&typeof v==='object'&&!Object.isFrozen(v)){for(const x of Object.values(v))freeze(x);Object.freeze(v);}return v;}

export async function signFheVerificationContext(input,keyPairs){
  const context=snapshot(input),keys=Array.isArray(keyPairs)?keyPairs.map(k=>({publicKey:k.publicKey,privateKey:k.privateKey})):keyPairs;
  return {format:'sumi-signed-fhe-context',version:1,context,signatures:await signQuorum(bytes(context),keys)};
}

// The trust roots and expected hash must come from an independent source.
export async function verifyFheVerificationContext(input,expectedHash,authorityTrust){
  const signed=structuredClone(input),trust=structuredClone(authorityTrust);
  if(!own(signed,['format','version','context','signatures'])||signed.format!=='sumi-signed-fhe-context'||signed.version!==1||!own(trust,['format','version','threshold','publicKeys'])||trust.format!=='sumi-fhe-context-authority-trust'||trust.version!==1||typeof expectedHash!=='string'||!/^[0-9a-f]{64}$/.test(expectedHash))fail();
  const context=snapshot(signed.context),contextHash=await hash(canonical(context));
  if(contextHash!==expectedHash)fail();
  const quorum=await verifyQuorum(bytes(context),signed.signatures,trust);
  return Object.freeze({context:freeze(context),contextHash,verifiedSignatures:quorum.verifiedSignatures});
}
