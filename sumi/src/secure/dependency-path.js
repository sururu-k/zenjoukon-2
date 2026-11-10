import { canonical, hash } from '../crypto.js';

// Public Merkle-path baseline. This is NOT zero knowledge or non-inclusion.
const own=(v,ks)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===ks.length&&ks.every(k=>Object.hasOwn(v,k));
const name=v=>typeof v==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9@/._:+-]{0,119}$/.test(v);
const hex=v=>typeof v==='string'&&/^[0-9a-f]{64}$/.test(v);
const invalid=()=>{throw new Error('依存関係、証明または期待する条件が不正です。');};
const digest=(kind,value)=>hash(canonical({domain:'sumi-dependency-merkle-v1',kind,value}));
const leaf=edge=>digest('edge',edge);
const node=(left,right)=>digest('node',[left,right]);

export async function createDependencySnapshot(input) {
  const edges=structuredClone(input);
  if(!Array.isArray(edges)||edges.length<1||edges.length>1024||edges.some(e=>!own(e,['from','to'])||!name(e.from)||!name(e.to)||e.from===e.to))invalid();
  edges.sort((a,b)=>canonical(a)<canonical(b)?-1:canonical(a)>canonical(b)?1:0);
  if(edges.some((e,i)=>i>0&&canonical(e)===canonical(edges[i-1])))invalid();
  const levels=[await Promise.all(edges.map(leaf))];
  while(levels.at(-1).length>1){
    const last=levels.at(-1), next=[];
    for(let i=0;i<last.length;i+=2)next.push(await node(last[i],last[i+1]??last[i]));
    levels.push(next);
  }
  const root=levels.at(-1)[0];
  return Object.freeze({root,async prove(inputPath){
    const path=structuredClone(inputPath);
    if(!Array.isArray(path)||path.length<2||path.length>33||path.some(v=>!name(v))||new Set(path).size!==path.length)invalid();
    const steps=[];
    for(let i=0;i<path.length-1;i++){
      const edge={from:path[i],to:path[i+1]}, index=edges.findIndex(e=>e.from===edge.from&&e.to===edge.to);
      if(index<0)invalid();
      let cursor=index;const siblings=[];
      for(let level=0;level<levels.length-1;level++){
        const row=levels[level], sibling=cursor^1;
        siblings.push({side:cursor%2?'left':'right',hash:row[sibling]??row[cursor]});cursor=Math.floor(cursor/2);
      }
      steps.push({edge,siblings});
    }
    return {format:'sumi-public-dependency-path',version:1,steps};
  }});
}

export async function verifyDependencyPath(input,expectedRoot,expectedFrom,expectedTo){
  const proof=structuredClone(input);
  if(!hex(expectedRoot)||!name(expectedFrom)||!name(expectedTo)||expectedFrom===expectedTo||!own(proof,['format','version','steps'])||proof.format!=='sumi-public-dependency-path'||proof.version!==1||!Array.isArray(proof.steps)||proof.steps.length<1||proof.steps.length>32)invalid();
  let previous=expectedFrom;const visited=new Set([previous]);
  for(const step of proof.steps){
    if(!own(step,['edge','siblings'])||!own(step.edge,['from','to'])||step.edge.from!==previous||!name(step.edge.to)||visited.has(step.edge.to)||!Array.isArray(step.siblings)||step.siblings.length>10)invalid();
    let current=await leaf(step.edge);
    for(const sibling of step.siblings){
      if(!own(sibling,['side','hash'])||!['left','right'].includes(sibling.side)||!hex(sibling.hash))invalid();
      current=sibling.side==='left'?await node(sibling.hash,current):await node(current,sibling.hash);
    }
    if(current!==expectedRoot)invalid();
    previous=step.edge.to;visited.add(previous);
  }
  if(previous!==expectedTo)invalid();
  return Object.freeze({from:expectedFrom,to:expectedTo,edgeCount:proof.steps.length});
}
