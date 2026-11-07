import { ristretto255, ristretto255_hasher } from '@noble/curves/ed25519.js';
import { canonical } from '../crypto.js';
import { minutes, randomBelow, utf8, mod } from './numeric.js';

// Pedersen commitments + Fiat–Shamir Schnorr proof of the aggregate opening.
// It proves the committed sum; it does not prove input truth, bounds, or PII removal.
const Point=ristretto255.Point,q=Point.Fn.ORDER,G=Point.BASE;
const H=ristretto255_hasher.hashToCurve(utf8('Sumi/Pedersen/independent-generator/v1'));
const mul=(p,s)=>s===0n?Point.ZERO:p.multiply(s);
const challenge=statement=>ristretto255_hasher.hashToScalar(utf8(canonical(statement)));
const point=s=>{if(typeof s!=='string'||!/^[0-9a-f]{64}$/.test(s))throw new Error('不正な群要素です。');return Point.fromHex(s);};
const transcript=(commitments,sum,R,context)=>({protocol:'sumi-committed-sum-v1',context,commitments,sum,R});

export function proveCommittedSum(input,context='通学時間の合計'){
  const values=minutes(input);
  if(typeof context!=='string'||!context.trim()||context.length>200)throw new Error('証明の用途を200文字以内で指定してください。');
  let blind=0n;const commitments=values.map(v=>{const r=randomBelow(q);blind=mod(blind+r,q);return mul(G,BigInt(v)).add(mul(H,r)).toHex();});
  const sum=values.reduce((a,b)=>a+b,0),nonce=randomBelow(q-1n)+1n,R=mul(H,nonce).toHex();
  const statement=transcript(commitments,sum,R,context),c=challenge(statement),s=mod(nonce+c*blind,q);
  return {...statement,response:s.toString(16).padStart(64,'0'),count:values.length};
}
export function verifyCommittedSum(proof){
  try{
    if(proof?.protocol!=='sumi-committed-sum-v1'||typeof proof.context!=='string'||!proof.context.trim()||proof.context.length>200||!Array.isArray(proof.commitments)||proof.commitments.length<1||proof.commitments.length>1000||proof.count!==proof.commitments.length||!Number.isInteger(proof.sum)||proof.sum<0||proof.sum>180000||typeof proof.response!=='string'||!/^[0-9a-f]{64}$/.test(proof.response))return false;
    const s=BigInt('0x'+proof.response);if(s>=q)return false;
    const Cs=proof.commitments.map(point),R=point(proof.R);
    if(R.equals(Point.ZERO))return false;
    const statement=transcript(proof.commitments,proof.sum,proof.R,proof.context),c=challenge(statement);
    const Y=Cs.reduce((a,b)=>a.add(b),Point.ZERO).subtract(mul(G,BigInt(proof.sum)));
    return mul(H,s).equals(R.add(mul(Y,c)));
  }catch{return false;}
}
