import { ristretto255, ristretto255_hasher } from '@noble/curves/ed25519.js';
import { canonical, hash } from '../crypto.js';
import { randomBelow, utf8, mod } from './numeric.js';
import { proveCommittedBitWithBlinding, verifyCommittedBit } from './bit-proof.js';

// Research prototype: each party verifies its own share opening and the
// public bit proof. It is separate from the existing P=2^61-1 survey format.
const Point=ristretto255.Point,q=Point.Fn.ORDER,G=Point.BASE;
const H=ristretto255_hasher.hashToCurve(utf8('Sumi/bit-proof/Pedersen-H/v1'));
const mul=(p,s)=>s===0n?Point.ZERO:p.multiply(s);
const encode=n=>n.toString(16).padStart(64,'0');
const decode=s=>{
  if(typeof s!=='string'||!/^[0-9a-f]{64}$/.test(s))throw new Error('不正なスカラーです。');
  const n=BigInt('0x'+s);if(n>=q)throw new Error('不正なスカラーです。');return n;
};
const point=s=>{
  if(typeof s!=='string'||!/^[0-9a-f]{64}$/.test(s))throw new Error('不正なコミットメントです。');
  return Point.fromHex(s);
};
const validId=s=>typeof s==='string'&&/^[a-zA-Z0-9_-]{8,80}$/.test(s);
const commit=(value,blind)=>mul(G,value).add(mul(H,blind));
const publicContext=async(campaign,batch,A,B)=>hash(canonical({protocol:'sumi-verified-survey-v1',campaign,batch,A,B}));

export async function createVerifiedSurveyBallot(answer,campaign){
  if(typeof answer!=='boolean'||!validId(campaign))throw new Error('回答または集計IDが不正です。');
  const bit=answer?1n:0n,batch=crypto.randomUUID();
  const a=randomBelow(q),b=mod(bit-a,q),ra=randomBelow(q),rb=randomBelow(q);
  const A=commit(a,ra).toHex(),B=commit(b,rb).toHex();
  const context=await publicContext(campaign,batch,A,B);
  const proof=proveCommittedBitWithBlinding(Number(bit),context,mod(ra+rb,q));
  const packet=(party,value,blind)=>({protocol:'sumi-verified-survey-v1',campaign,batch,party,value:encode(value),blind:encode(blind),A,B,proof});
  return {A:packet('A',a,ra),B:packet('B',b,rb)};
}

export async function verifySurveyShare(input,party,campaign){
  try{
    const p=structuredClone(input);
    if(!['A','B'].includes(party)||!validId(campaign)||p?.protocol!=='sumi-verified-survey-v1'||p.party!==party||p.campaign!==campaign||!validId(p.batch))return false;
    const A=point(p.A),B=point(p.B),value=decode(p.value),blind=decode(p.blind);
    if(!commit(value,blind).equals(party==='A'?A:B))return false;
    if(p.proof?.commitment!==A.add(B).toHex())return false;
    if(p.proof.context!==await publicContext(campaign,p.batch,p.A,p.B))return false;
    return verifyCommittedBit(p.proof);
  }catch{return false;}
}

// Each collector receives one share. Aggregate openings can be checked
// against the public commitments, but do not authenticate the server or prove
// that every submitted ballot was included.
export function createVerifiedSurveyCollector(party,campaign){
  if(!['A','B'].includes(party)||!validId(campaign))throw new Error('集計担当または集計IDが不正です。');
  const packets=new Map();let state='open',received=0;
  return Object.freeze({
    get count(){return received;},get phase(){return state;},
    async receive(input,options={}){
      if(state!=='open')throw new Error('集計は確定しています。');
      const p=structuredClone(input);
      if(!await verifySurveyShare(p,party,campaign))throw new Error('回答シェアまたは証明が不正です。');
      const fingerprint=options.idempotent?await hash(canonical(p)):null;
      if(state!=='open')throw new Error('集計は確定しています。');
      const existing=packets.get(p.batch);
      if(existing){
        if(options.idempotent&&existing.fingerprint===fingerprint)return options.receipt?{count:received,duplicate:true}:received;
        throw new Error('回答が重複しています。');
      }
      if(packets.size>=100)throw new Error('回答数が上限に達しました。');
      packets.set(p.batch,{value:p.value,blind:p.blind,A:p.A,B:p.B,proof:p.proof,fingerprint});received++;
      return options.receipt?{count:received,duplicate:false}:received;
    },
    async publish(){
      if(state!=='open'||packets.size<3)throw new Error('未確定の回答が３件以上必要です。');
      state='closing';
      const entries=[...packets].sort(([a],[b])=>a<b?-1:a>b?1:0);
      const ballots=entries.map(([batch,{A,B,proof}])=>({batch,A,B,proof}));
      const digest=await hash(canonical(ballots));
      const sum=entries.reduce((n,[,p])=>mod(n+decode(p.value),q),0n);
      const blind=entries.reduce((n,[,p])=>mod(n+decode(p.blind),q),0n);
      packets.clear();state='published';
      return {protocol:'sumi-verified-total-v2',campaign,party,count:entries.length,digest,share:encode(sum),blind:encode(blind),ballots};
    }
  });
}

async function verifyTotal(total){
  if(!Array.isArray(total.ballots)||total.ballots.length!==total.count||await hash(canonical(total.ballots))!==total.digest)return false;
  let previous='',sum=Point.ZERO;
  for(const ballot of total.ballots){
    if(!ballot||!validId(ballot.batch)||ballot.batch<=previous)return false;
    previous=ballot.batch;
    const A=point(ballot.A),B=point(ballot.B);
    if(ballot.proof?.commitment!==A.add(B).toHex()||ballot.proof.context!==await publicContext(total.campaign,ballot.batch,ballot.A,ballot.B)||!verifyCommittedBit(ballot.proof))return false;
    sum=sum.add(total.party==='A'?A:B);
  }
  return commit(decode(total.share),decode(total.blind)).equals(sum);
}

// Verify one published aggregate without requiring the other collector's
// secret share. This checks consistency with its public commitments, not
// submitter identity, completeness, or whether collectors are independent.
export async function verifyVerifiedSurveyTotal(input){
  try{
    const total=structuredClone(input);
    if(total?.protocol!=='sumi-verified-total-v2'||!['A','B'].includes(total.party)||!validId(total.campaign)||!Number.isInteger(total.count)||total.count<3||total.count>100||typeof total.digest!=='string'||!/^[a-f0-9]{64}$/.test(total.digest))return false;
    return await verifyTotal(total);
  }catch{return false;}
}

export async function combineVerifiedSurveyTotals(inputA,inputB){
  const a=structuredClone(inputA),b=structuredClone(inputB);
  if(a?.protocol!=='sumi-verified-total-v2'||b?.protocol!==a.protocol||a.party!=='A'||b.party!=='B'||!validId(a.campaign)||a.campaign!==b.campaign||!Number.isInteger(a.count)||a.count<3||a.count>100||a.count!==b.count||typeof a.digest!=='string'||!/^[a-f0-9]{64}$/.test(a.digest)||a.digest!==b.digest)throw new Error('集計結果が対応していません。');
  if(!await verifyTotal(a)||!await verifyTotal(b))throw new Error('集計結果と提出内容の検証に失敗しました。');
  const sum=mod(decode(a.share)+decode(b.share),q);
  if(sum>BigInt(a.count))throw new Error('合計が回答数を超えています。');
  return {count:a.count,yes:Number(sum),no:a.count-Number(sum)};
}
