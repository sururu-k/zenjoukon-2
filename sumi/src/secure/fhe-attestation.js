import { canonical, hash } from '../crypto.js';
import { evaluateCiphertexts } from './fhe.js';
import { signQuorum, verifyQuorum } from './signature-quorum.js';

// Ciphertext addition is recomputed by the verifier. The decrypted result is
// a statement by trusted signers, not a ZK proof of correct BFV decryption.
const DOMAIN='sumi/fhe-aggregate-attestation/v1\n';
const own=(v,keys)=>v && typeof v==='object' && !Array.isArray(v) && Object.keys(v).length===keys.length && keys.every(k=>Object.hasOwn(v,k));
const fail=()=>{throw new Error('暗号集計、依頼または信頼設定が不正です。');};
const bytes=payload=>new TextEncoder().encode(DOMAIN+canonical(payload));
const hex=v=>typeof v==='string'&&/^[0-9a-f]{64}$/.test(v);

export async function createFheRequest(input, datasetId, recipient, requestId) {
  const packets=structuredClone(input);
  if(!Array.isArray(packets)||packets.length<1||packets.length>100||typeof datasetId!=='string'||!/^[a-zA-Z0-9_-]{1,80}$/.test(datasetId)||typeof recipient!=='string'||!/^[a-zA-Z0-9_-]{1,80}$/.test(recipient)||typeof requestId!=='string'||!/^[a-zA-Z0-9_-]{16,80}$/.test(requestId)) fail();
  const ids=new Set();let total=0;
  for(const p of packets){
    if(!own(p,['protocol','parameters','keyId','id','count','ciphertext'])||p.protocol!=='sumi-bfv-input-v1'||p.parameters!=='sumi-bfv-4096-20-tc128-v1'||!hex(p.keyId)||p.keyId!==packets[0].keyId||typeof p.id!=='string'||!/^[a-zA-Z0-9_-]{1,80}$/.test(p.id)||ids.has(p.id)||!Number.isInteger(p.count)||p.count<1||p.count>1000||typeof p.ciphertext!=='string'||p.ciphertext.length>500000)fail();
    ids.add(p.id);total+=p.count;
  }
  if(total>1000)fail();
  return Object.freeze({format:'sumi-fhe-request',version:1,datasetId,recipient,requestId,keyId:packets[0].keyId,inputDigest:await hash(canonical(packets)),count:total});
}

export async function createFheAggregateAttestation(owner,input,expectedRequest,keyPairs){
  const packets=structuredClone(input),request=structuredClone(expectedRequest);
  const keys=Array.isArray(keyPairs)?keyPairs.map(pair=>({publicKey:pair.publicKey,privateKey:pair.privateKey})):keyPairs;
  if(!request||typeof owner?.decrypt!=='function')fail();
  const expected=await createFheRequest(packets,request.datasetId,request.recipient,request.requestId);
  if(canonical(request)!==canonical(expected)||owner.keyId!==request.keyId)fail();
  const encryptedTotal=await evaluateCiphertexts(packets),result=owner.decrypt(encryptedTotal);
  const payload={format:'sumi-fhe-aggregate-attestation',version:1,request,encryptedTotal,sum:result.sum,count:result.count};
  return {payload,signatures:await signQuorum(bytes(payload),keys)};
}

export async function verifyFheAggregateAttestation(input,inputPackets,expectedRequest,trust){
  const envelope=structuredClone(input),packets=structuredClone(inputPackets),request=structuredClone(expectedRequest),anchors=structuredClone(trust);
  if(!own(envelope,['payload','signatures'])||!own(envelope.payload,['format','version','request','encryptedTotal','sum','count'])||envelope.payload.format!=='sumi-fhe-aggregate-attestation'||envelope.payload.version!==1||!own(anchors,['format','version','threshold','publicKeys'])||anchors.format!=='sumi-fhe-decryptor-trust'||anchors.version!==1||!request)fail();
  const expected=await createFheRequest(packets,request.datasetId,request.recipient,request.requestId);
  const p=envelope.payload;
  if(canonical(request)!==canonical(expected)||canonical(p.request)!==canonical(expected)||!Number.isInteger(p.sum)||p.sum<0||p.sum>180*request.count||p.count!==request.count)fail();
  const verified=await verifyQuorum(bytes(p),envelope.signatures,anchors);
  const recomputed=await evaluateCiphertexts(packets);
  if(canonical(p.encryptedTotal)!==canonical(recomputed))fail();
  return Object.freeze({datasetId:request.datasetId,requestId:request.requestId,sum:p.sum,count:p.count,verifiedSignatures:verified.verifiedSignatures,guarantee:'recomputed-bfv-addition-trusted-decryption'});
}
