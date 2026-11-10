import { canonical } from '../crypto.js';
import { validateSchoolPolicy } from '../school-policy-contract.js';
import { signQuorum, verifyQuorum } from './signature-quorum.js';

// Independent signatures, not threshold cryptography. Trust keys and quorum
// are supplied separately by the verifier; neither comes from the envelope.
const FORMAT='sumi-signed-school-policy';
const DOMAIN='sumi/signed-school-policy/v1\n';
const encoder=new TextEncoder();
const ownKeys=(object,keys)=>object && typeof object==='object' && !Array.isArray(object) && Object.keys(object).length===keys.length && keys.every(k=>Object.hasOwn(object,k));
const invalid=()=>{throw new Error('署名付き学校設定または信頼設定が不正です。');};
const policySnapshot=input=>validateSchoolPolicy(structuredClone(input));
const signingBytes=policy=>encoder.encode(DOMAIN+canonical(policy));

export async function signSchoolPolicy(input,keyPairs){
  const policy=policySnapshot(input);
  const signatures=await signQuorum(signingBytes(policy),keyPairs);
  return {format:FORMAT,version:1,policy,signatures};
}
export async function verifySchoolPolicy(envelope,trust){
  const signed=structuredClone(envelope),anchors=structuredClone(trust);
  if(!ownKeys(signed,['format','version','policy','signatures'])||signed.format!==FORMAT||signed.version!==1)invalid();
  if(!ownKeys(anchors,['format','version','threshold','publicKeys'])||anchors.format!=='sumi-school-policy-trust'||anchors.version!==1)invalid();
  const policy=policySnapshot(signed.policy);
  const quorum=await verifyQuorum(signingBytes(policy),signed.signatures,anchors);
  return Object.freeze({policy,...quorum});
}
