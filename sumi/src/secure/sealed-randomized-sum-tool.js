import { canonical, hash, encryptDraft, decryptDraft } from '../crypto.js';
import { randomizedResponse } from './dp.js';
import { createSignedSum } from './verified-sum-bridge.js';
import { RANDOMIZED_SUM_TOOL } from './verified-tool-gateway.js';

const ownKeys = (v, keys) => v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v,k));
const fail = () => { throw new Error('ランダム化集計の保存状態または依頼が不正です。'); };

// Preparation is a trusted, one-time operation. Repeating it creates a new
// release and spends additional privacy budget; no global ledger is implied.
export async function prepareRandomizedSumSnapshot(inputDatasets, passphrase) {
  const datasets=structuredClone(inputDatasets);
  if (!datasets || typeof datasets !== 'object' || Array.isArray(datasets) || Object.keys(datasets).length<1 || Object.keys(datasets).length>50) fail();
  const samples=[];
  for (const [id,values] of Object.entries(datasets)) {
    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(id) || !Array.isArray(values) || values.length<3 || values.length>1000 || values.some(v=>typeof v!=='boolean')) fail();
    const draws=crypto.getRandomValues(new Uint8Array(values.length));
    const sum=values.reduce((n,v,i)=>n+Number(randomizedResponse(v,draws[i]&3)),0);
    samples.push({id,count:values.length,sum});
  }
  // No raw or per-person randomized input is included in the snapshot.
  const envelope=await encryptDraft({format:'sumi-randomized-sum-snapshot',version:1,samples},passphrase);
  return {envelope,checkpoint:await hash(canonical(envelope))};
}

// The checkpoint must come from an independent trusted source. The restored
// tool signs a sum proof over synthetic bits consistent with the saved sum;
// it does not prove the randomization or the original data's provenance.
export async function openRandomizedSumSnapshot(inputEnvelope, passphrase, expectedCheckpoint, signingKeys) {
  const envelope=structuredClone(inputEnvelope);
  const keys=Array.isArray(signingKeys)?signingKeys.map(pair=>Object.freeze({publicKey:pair.publicKey,privateKey:pair.privateKey})):null;
  if (typeof expectedCheckpoint!=='string' || !/^[0-9a-f]{64}$/.test(expectedCheckpoint) || !keys || keys.length<1 || keys.length>10 || await hash(canonical(envelope))!==expectedCheckpoint) fail();
  const payload=await decryptDraft(envelope,passphrase);
  if (!ownKeys(payload,['format','version','samples']) || payload.format!=='sumi-randomized-sum-snapshot' || payload.version!==1 || !Array.isArray(payload.samples) || payload.samples.length<1 || payload.samples.length>50) fail();
  const samples=new Map();
  for (const sample of payload.samples) {
    if (!ownKeys(sample,['id','count','sum']) || typeof sample.id!=='string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(sample.id) || !Number.isInteger(sample.count) || sample.count<3 || sample.count>1000 || !Number.isInteger(sample.sum) || sample.sum<0 || sample.sum>sample.count || samples.has(sample.id)) fail();
    samples.set(sample.id,Object.freeze({count:sample.count,sum:sample.sum}));
  }
  return Object.freeze({
    async run(inputCall) {
      const call=structuredClone(inputCall);
      if (!ownKeys(call,['name','arguments','request']) || call.name!==RANDOMIZED_SUM_TOOL || !ownKeys(call.arguments,['datasetId']) || typeof call.arguments.datasetId!=='string' || !samples.has(call.arguments.datasetId)) fail();
      const context=`sumi-tool-v1:${await hash(canonical({name:call.name,arguments:call.arguments}))}`;
      if (call.request?.purpose!==context) fail();
      const {count,sum}=samples.get(call.arguments.datasetId);
      const witness=Array.from({length:count},(_,i)=>Number(i<sum));
      const evidence=await createSignedSum(witness,call.request,keys);
      return {result:{sum,count},evidence};
    }
  });
}
