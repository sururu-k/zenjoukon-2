import { canonical, keyFingerprint } from '../crypto.js';
import { signQuorum, verifyQuorum } from './signature-quorum.js';
import { combineVerifiedSurveyTotals, verifyVerifiedSurveyTotal } from './verified-survey.js';

// Each collector signs only its aggregate, never the individual shares. The
// verifier supplies the expected campaign and separate trust roots for A/B.
// Signatures do not establish real-world identity or non-collusion.
const DOMAIN='sumi/signed-survey-total/v1\n';
const FORMAT='sumi-signed-survey-total';
const TRUST='sumi-survey-collector-trust';
const encoder=new TextEncoder();
const validId=s=>typeof s==='string'&&/^[a-zA-Z0-9_-]{8,80}$/.test(s);
const ownKeys=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const fail=()=>{throw new Error('署名付き集計結果または信頼設定が不正です。');};
const bytes=payload=>encoder.encode(DOMAIN+canonical(payload));
function validTotalShape(t){
  if(!ownKeys(t,['protocol','campaign','party','count','digest','share','blind','ballots'])||t.protocol!=='sumi-verified-total-v2'||!validId(t.campaign)||!['A','B'].includes(t.party)||!Number.isInteger(t.count)||t.count<3||t.count>100||!Array.isArray(t.ballots)||t.ballots.length!==t.count||![t.digest,t.share,t.blind].every(v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v)))return false;
  return t.ballots.every(b=>ownKeys(b,['batch','A','B','proof'])&&ownKeys(b.proof,['protocol','context','commitment','R0','R1','e0','e1','z0','z1'])&&validId(b.batch)&&Object.values(b.proof).every(v=>typeof v==='string'&&v.length<=200)&&typeof b.A==='string'&&b.A.length===64&&typeof b.B==='string'&&b.B.length===64);
}
function validAnchor(a){return ownKeys(a,['threshold','publicKeys'])&&Array.isArray(a.publicKeys)&&a.publicKeys.length>=1&&a.publicKeys.length<=10&&Number.isInteger(a.threshold)&&a.threshold>=1&&a.threshold<=a.publicKeys.length;}
function validEnvelope(e){return ownKeys(e,['payload','signatures'])&&ownKeys(e.payload,['format','version','total'])&&e.payload.format===FORMAT&&e.payload.version===1&&validTotalShape(e.payload.total);}

export async function signSurveyTotal(input,keyPairs){
  const total=structuredClone(input);
  if(!validTotalShape(total)||!await verifyVerifiedSurveyTotal(total))fail();
  const payload={format:FORMAT,version:1,total};
  return {payload,signatures:await signQuorum(bytes(payload),keyPairs)};
}

export async function combineSignedSurveyTotals(inputA,inputB,expectedCampaign,trust){
  const a=structuredClone(inputA),b=structuredClone(inputB),anchors=structuredClone(trust);
  if(!validEnvelope(a)||!validEnvelope(b)||!validId(expectedCampaign)||a.payload.total.party!=='A'||b.payload.total.party!=='B'||a.payload.total.campaign!==expectedCampaign||b.payload.total.campaign!==expectedCampaign)fail();
  if(!ownKeys(anchors,['format','version','A','B'])||anchors.format!==TRUST||anchors.version!==1||!validAnchor(anchors.A)||!validAnchor(anchors.B))fail();
  // Distinct keys prevent one key from counting for both roles. Whether those
  // keys belong to independent people or machines remains an assumption.
  const aIds=new Set();
  for(const key of anchors.A.publicKeys){const id=await keyFingerprint(key);if(aIds.has(id))fail();aIds.add(id);}
  const bIds=new Set();
  for(const key of anchors.B.publicKeys){const id=await keyFingerprint(key);if(aIds.has(id)||bIds.has(id))fail();bIds.add(id);}
  const signedA=await verifyQuorum(bytes(a.payload),a.signatures,anchors.A);
  const signedB=await verifyQuorum(bytes(b.payload),b.signatures,anchors.B);
  // These checks re-verify each bit proof, aggregate opening, and common set.
  const result=await combineVerifiedSurveyTotals(a.payload.total,b.payload.total);
  return Object.freeze({...result,campaign:expectedCampaign,verifiedA:signedA.verifiedSignatures,verifiedB:signedB.verifiedSignatures});
}
