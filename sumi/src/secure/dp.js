import { minutes } from './numeric.js';

// Exact randomized response: truthful with 3/4, flipped with 1/4.
// Uniform two-bit sampling avoids floating-point inverse-CDF noise generation.
export const EPSILON=Math.log(3);
export function randomizedResponse(bit,draw){
  if(typeof bit!=='boolean'||!Number.isInteger(draw)||draw<0||draw>3)throw new Error('不正な回答または乱数です。');
  return draw===0?!bit:bit;
}
export function releaseLongCommute(input){
  const values=minutes(input),random=new Uint8Array(values.length);crypto.getRandomValues(random);
  const positive=values.reduce((n,v,i)=>n+Number(randomizedResponse(v>=60,random[i]&3)),0),count=values.length;
  return {protocol:'sumi-randomized-response-v1',epsilon:EPSILON,delta:0,publicCount:count,thresholdMinutes:60,randomizedPositive:positive,estimatedPositive:Math.max(0,Math.min(count,2*positive-count/2)),scope:'既知の人数における1人1回答の置換隣接。1回の公開ごとにε=ln(3)。再公開時は合成。'};
}
// The UI retains a single release for an unchanged dataset. Reloads and other
// devices are outside this in-memory ledger; do not claim lifetime accounting.
export function createReleaseLedger(){
  const released=new Map();
  return Object.freeze({release(input){const values=minutes(input),key=JSON.stringify(values);if(!released.has(key))released.set(key,Object.freeze(releaseLongCommute(values)));return released.get(key);}});
}
