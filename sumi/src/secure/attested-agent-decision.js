import { canonical } from '../crypto.js';
import { verifyDecisionReceipt } from '../agent-guard.js';
import { signQuorum, verifyQuorum } from './signature-quorum.js';

// These signatures attest to the decision record only. They do not prove the
// actor identity, that the operation happened, or that a log is complete.
const encoder=new TextEncoder();
const DOMAIN='sumi/attested-agent-decision/v1\n';
const ownKeys=(object,keys)=>object && typeof object==='object' && !Array.isArray(object) && Object.keys(object).length===keys.length && keys.every(k=>Object.hasOwn(object,k));
const invalid=()=>{throw new Error('署名付き判定記録または信頼設定が不正です。');};
const bytes=receipt=>encoder.encode(DOMAIN+canonical(receipt));
function freeze(value){
  if(value&&typeof value==='object'&&!Object.isFrozen(value)){
    for(const item of Object.values(value))freeze(item);
    Object.freeze(value);
  }
  return value;
}
async function validate(receipt){
  if(!ownKeys(receipt,['format','version','input','result','digest'])||!ownKeys(receipt.input,['actor','action','resource'])||!ownKeys(receipt.result,['decision','reason','policy'])||Object.values(receipt.input).some(v=>typeof v!=='string'||v.length>80)||!await verifyDecisionReceipt(receipt))invalid();
}
export async function attestAgentDecision(input,keyPairs){
  const receipt=structuredClone(input);
  await validate(receipt);
  const signatures=await signQuorum(bytes(receipt),keyPairs);
  return {format:'sumi-attested-agent-decision',version:1,receipt,signatures};
}
export async function verifyAttestedAgentDecision(input,trust){
  const envelope=structuredClone(input),anchors=structuredClone(trust);
  if(!ownKeys(envelope,['format','version','receipt','signatures'])||envelope.format!=='sumi-attested-agent-decision'||envelope.version!==1||!ownKeys(anchors,['format','version','threshold','publicKeys'])||anchors.format!=='sumi-agent-decision-trust'||anchors.version!==1)invalid();
  await validate(envelope.receipt);
  const quorum=await verifyQuorum(bytes(envelope.receipt),envelope.signatures,anchors);
  return Object.freeze({receipt:freeze(envelope.receipt),...quorum});
}
