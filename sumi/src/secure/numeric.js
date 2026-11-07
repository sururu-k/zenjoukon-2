export const MAX_CONTRIBUTIONS=1000;
export const MAX_MINUTES=180;
export const utf8=value=>new TextEncoder().encode(value);
export function minutes(values){
  if(!Array.isArray(values)||!values.length||values.length>MAX_CONTRIBUTIONS||values.some(v=>!Number.isInteger(v)||v<0||v>MAX_MINUTES))throw new Error('通学時間は0〜180分の整数で、1〜1,000件を入力してください。');
  return [...values];
}
export function parseMinutes(text){
  if(typeof text!=='string'||text.length>10000||!/^\s*\d+(?:[\s,、]+\d+)*\s*$/.test(text))throw new Error('通学時間だけを、改行かカンマで区切って入力してください。');
  return minutes(text.trim().split(/[\s,、]+/).map(Number));
}
export function randomBelow(modulus){
  const bits=modulus.toString(2).length,bytes=new Uint8Array(Math.ceil(bits/8)),mask=255>>>(bytes.length*8-bits);
  for(;;){crypto.getRandomValues(bytes);bytes[0]&=mask;let n=0n;for(const b of bytes)n=(n<<8n)|BigInt(b);if(n<modulus)return n;}
}
export const mod=(x,p)=>((x%p)+p)%p;
