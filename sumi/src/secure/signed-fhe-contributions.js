import { canonical, keyFingerprint } from '../crypto.js';
import { signQuorum, verifyQuorum } from './signature-quorum.js';
import { createFheRequest } from './fhe-attestation.js';

const DOMAIN='sumi/fhe-contribution/v1\n';
const own=(v,k)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===k.length&&k.every(x=>Object.hasOwn(v,x));
const fail=()=>{throw new Error('暗号化された入力、参加者または集計回が不正です。');};
const bytes=p=>new TextEncoder().encode(DOMAIN+canonical(p));
function roundSnapshot(input){
  const r=structuredClone(input);
  if(!own(r,['format','version','roundId','datasetId','recipient','keyId'])||r.format!=='sumi-fhe-round'||r.version!==1||typeof r.roundId!=='string'||!/^[a-zA-Z0-9_-]{16,80}$/.test(r.roundId)||typeof r.datasetId!=='string'||!/^[a-zA-Z0-9_-]{1,80}$/.test(r.datasetId)||typeof r.recipient!=='string'||!/^[a-zA-Z0-9_-]{1,80}$/.test(r.recipient)||typeof r.keyId!=='string'||!/^[a-f0-9]{64}$/.test(r.keyId))fail();
  return r;
}
const validId=v=>typeof v==='string'&&/^[a-zA-Z0-9_-]{1,80}$/.test(v);

export async function signFheContribution(inputPacket,inputRound,participantId,keyPair){
  const packet=structuredClone(inputPacket),round=roundSnapshot(inputRound),key={publicKey:keyPair?.publicKey,privateKey:keyPair?.privateKey};
  if(!validId(participantId))fail();
  const checked=await createFheRequest([packet],round.datasetId,round.recipient,round.roundId);
  if(checked.keyId!==round.keyId)fail();
  const payload={format:'sumi-signed-fhe-contribution',version:1,round,participantId,packet};
  return {payload,signatures:await signQuorum(bytes(payload),[key])};
}

// Registry and expected round are independently supplied by the verifier.
// This proves key possession and a fixed ciphertext set, not real identities,
// truthfulness, input ranges, or distinct humans behind the keys.
export async function verifyFheContributions(inputBundles,inputRound,inputParticipants){
  const bundles=structuredClone(inputBundles),round=roundSnapshot(inputRound),participants=structuredClone(inputParticipants);
  if(!Array.isArray(participants)||participants.length<3||participants.length>50||!Array.isArray(bundles)||bundles.length!==participants.length)fail();
  const trusted=new Map(),fingerprints=new Set();
  for(const item of participants){
    if(!own(item,['participantId','publicKey'])||!validId(item.participantId)||trusted.has(item.participantId))fail();
    const id=await keyFingerprint(item.publicKey);if(fingerprints.has(id))fail();
    fingerprints.add(id);trusted.set(item.participantId,item.publicKey);
  }
  const accepted=new Map();
  for(const bundle of bundles){
    if(!own(bundle,['payload','signatures'])||!own(bundle.payload,['format','version','round','participantId','packet'])||bundle.payload.format!=='sumi-signed-fhe-contribution'||bundle.payload.version!==1||canonical(bundle.payload.round)!==canonical(round)||!trusted.has(bundle.payload.participantId)||accepted.has(bundle.payload.participantId))fail();
    await verifyQuorum(bytes(bundle.payload),bundle.signatures,{threshold:1,publicKeys:[trusted.get(bundle.payload.participantId)]});
    accepted.set(bundle.payload.participantId,bundle.payload.packet);
  }
  const packets=[...trusted.keys()].sort().map(id=>accepted.get(id));
  const request=await createFheRequest(packets,round.datasetId,round.recipient,round.roundId);
  if(request.keyId!==round.keyId)fail();
  return Object.freeze({packets,participants:participants.length,round:Object.freeze(round)});
}
