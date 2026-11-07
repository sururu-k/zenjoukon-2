import { canonical, hash } from '../crypto.js';
import { minutes, randomBelow, mod } from './numeric.js';
const P=(1n<<61n)-1n;
const id=s=>typeof s==='string'&&/^[a-zA-Z0-9_-]{8,80}$/.test(s);
function element(s){if(typeof s!=='string'||!/^\d{1,19}$/.test(s)||BigInt(s)>=P)throw new Error('不正なシェアです。');return BigInt(s);}

// Two non-colluding, honest-but-curious aggregators. No per-person shares are opened.
export function splitContribution(input,campaign){
  const values=minutes(input);if(!id(campaign))throw new Error('共通の集計IDを半角英数字8〜80文字で指定してください。');
  const batch=crypto.randomUUID(),sum=BigInt(values.reduce((a,b)=>a+b,0)),a=randomBelow(P),b=mod(sum-a,P);
  const packet=party=>({protocol:'sumi-mpc-sum-v1',campaign,batch,party,count:values.length,share:(party==='A'?a:b).toString()});
  return {A:packet('A'),B:packet('B')};
}
export async function aggregateParty(packets,party){
  if(!['A','B'].includes(party)||!Array.isArray(packets)||packets.length<2||packets.length>100)throw new Error('同じ担当者宛てのシェアを2〜100組読み込んでください。');
  const campaign=packets[0].campaign,batches=new Set();let sum=0n,count=0;
  for(const p of packets){
    if(p?.protocol!=='sumi-mpc-sum-v1'||p.party!==party||!id(campaign)||p.campaign!==campaign||!id(p.batch)||batches.has(p.batch)||!Number.isInteger(p.count)||p.count<1||p.count>1000)throw new Error('集計ID・担当者・件数が不正か、同じ組が重複しています。');
    batches.add(p.batch);sum=mod(sum+element(p.share),P);count+=p.count;
  }
  return {protocol:'sumi-mpc-total-v1',campaign,party,contributors:packets.length,count,batchDigest:await hash(canonical([...batches].sort())),share:sum.toString()};
}
export function combinePartyTotals(a,b){
  if(a?.protocol!=='sumi-mpc-total-v1'||b?.protocol!==a.protocol||a.party!=='A'||b.party!=='B'||!id(a.campaign)||a.campaign!==b.campaign||!Number.isInteger(a.count)||a.count<2||a.count>100000||a.count!==b.count||!Number.isInteger(a.contributors)||a.contributors<2||a.contributors>100||a.contributors!==b.contributors||typeof a.batchDigest!=='string'||!/^[a-f0-9]{64}$/.test(a.batchDigest)||a.batchDigest!==b.batchDigest)throw new Error('対応する2者の集計結果が揃っていません。');
  const sum=Number(mod(element(a.share)+element(b.share),P));
  if(sum>180*a.count)throw new Error('集計値が範囲外です。シェアを確認してください。');
  return {protocol:'sumi-mpc-result-v1',campaign:a.campaign,count:a.count,contributors:a.contributors,sum,mean:sum/a.count};
}
