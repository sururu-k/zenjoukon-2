import { canonical, hash } from '../crypto.js';
import { randomizedResponse } from './dp.js';
import { createSignedSum } from './verified-sum-bridge.js';
import { RANDOMIZED_SUM_TOOL } from './verified-tool-gateway.js';

const ownKeys = (v, keys) => v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v,k));
const fail = () => { throw new Error('ランダム化集計の設定または依頼が不正です。'); };

// Research demo with a trusted curator: raw bits are held by this process.
// Signatures and sum proof do not prove that randomization was honestly done.
// One cached randomization per fixed dataset and process; restarts, multiple
// processes, overlapping datasets and external releases are not accounted for.
export function createRandomizedSumTool(inputDatasets, signingKeys) {
  const datasets = structuredClone(inputDatasets);
  if (!datasets || typeof datasets !== 'object' || Array.isArray(datasets) || Object.keys(datasets).length < 1 || Object.keys(datasets).length > 50 || !Array.isArray(signingKeys) || signingKeys.length < 1 || signingKeys.length > 10) fail();
  const inputs = new Map(), samples = new Map();
  for (const [id, values] of Object.entries(datasets)) {
    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(id) || !Array.isArray(values) || values.length < 3 || values.length > 1000 || values.some(v => typeof v !== 'boolean')) fail();
    inputs.set(id, values);
  }
  const keys = signingKeys.map(pair => Object.freeze({ publicKey:pair.publicKey, privateKey:pair.privateKey }));
  return Object.freeze({
    async run(inputCall) {
      const call = structuredClone(inputCall);
      if (!ownKeys(call,['name','arguments','request']) || call.name !== RANDOMIZED_SUM_TOOL || !ownKeys(call.arguments,['datasetId']) || typeof call.arguments.datasetId !== 'string' || !inputs.has(call.arguments.datasetId)) fail();
      const expected = `sumi-tool-v1:${await hash(canonical({name:call.name,arguments:call.arguments}))}`;
      if (call.request?.purpose !== expected) fail();
      const id = call.arguments.datasetId;
      if (!samples.has(id)) {
        const values = inputs.get(id), draws = crypto.getRandomValues(new Uint8Array(values.length));
        samples.set(id, values.map((v,i) => Number(randomizedResponse(v,draws[i] & 3))));
      }
      const evidence = await createSignedSum(samples.get(id), call.request, keys);
      return { result:{sum:evidence.payload.proof.sum,count:evidence.payload.proof.count}, evidence };
    }
  });
}
