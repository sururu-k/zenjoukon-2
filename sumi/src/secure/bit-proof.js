import { ristretto255, ristretto255_hasher } from '@noble/curves/ed25519.js';
import { canonical } from '../crypto.js';
import { randomBelow, utf8, mod } from './numeric.js';

// Experimental CDS-style OR proof for a Pedersen commitment to 0 or 1.
// It is not bound to the survey's existing shares and is not a voting system.
const Point=ristretto255.Point,q=Point.Fn.ORDER,G=Point.BASE;
const H=ristretto255_hasher.hashToCurve(utf8('Sumi/bit-proof/Pedersen-H/v1'));
const mul=(p,s)=>s===0n?Point.ZERO:p.multiply(s);
const enc=n=>n.toString(16).padStart(64,'0');
const scalar=s=>{
  if(typeof s!=='string'||!/^[0-9a-f]{64}$/.test(s))throw new Error('invalid scalar');
  const n=BigInt('0x'+s);if(n>=q)throw new Error('invalid scalar');return n;
};
const point=s=>{if(typeof s!=='string'||!/^[0-9a-f]{64}$/.test(s))throw new Error('invalid point');return Point.fromHex(s);};
const contextOK=c=>typeof c==='string'&&c.trim().length>0&&c.length<=200;
const challenge=(context,commitment,R0,R1)=>ristretto255_hasher.hashToScalar(utf8(canonical({protocol:'sumi-bit-or-v1',context,commitment,R0,R1})));

export function proveCommittedBit(bit,context){
  if((bit!==0&&bit!==1)||!contextOK(context))throw new Error('回答は0または1、用途は200文字以内で指定してください。');
  const r=randomBelow(q),C=mul(G,BigInt(bit)).add(mul(H,r)),Y=[C,C.subtract(G)];
  const fake=1-bit,e=[0n,0n],z=[0n,0n],R=[Point.ZERO,Point.ZERO];
  e[fake]=randomBelow(q);z[fake]=randomBelow(q);
  R[fake]=mul(H,z[fake]).subtract(mul(Y[fake],e[fake]));
  const nonce=randomBelow(q);R[bit]=mul(H,nonce);
  const commitment=C.toHex(),R0=R[0].toHex(),R1=R[1].toHex();
  e[bit]=mod(challenge(context,commitment,R0,R1)-e[fake],q);
  z[bit]=mod(nonce+e[bit]*r,q);
  return {protocol:'sumi-bit-or-v1',context,commitment,R0,R1,e0:enc(e[0]),e1:enc(e[1]),z0:enc(z[0]),z1:enc(z[1])};
}

export function verifyCommittedBit(proof){
  try{
    if(proof?.protocol!=='sumi-bit-or-v1'||!contextOK(proof.context))return false;
    const C=point(proof.commitment),R=[point(proof.R0),point(proof.R1)];
    const e=[scalar(proof.e0),scalar(proof.e1)],z=[scalar(proof.z0),scalar(proof.z1)],Y=[C,C.subtract(G)];
    if(mod(e[0]+e[1],q)!==challenge(proof.context,proof.commitment,proof.R0,proof.R1))return false;
    return [0,1].every(i=>mul(H,z[i]).equals(R[i].add(mul(Y[i],e[i]))));
  }catch{return false;}
}
