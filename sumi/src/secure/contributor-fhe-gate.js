import { createFheDecryptionGate } from './fhe-decryption-gate.js';
import { verifyFheContributions } from './signed-fhe-contributions.js';

// The trusted operator pins the roster and round. The agent never chooses the
// packets after approval. Neither this wrapper nor signatures isolate a process.
export function createContributorFheGate({owner,signingKeys,expectedRound,participants}) {
  const round=structuredClone(expectedRound),roster=structuredClone(participants);
  if(!round||round.keyId!==owner?.keyId)throw new Error('集計回の鍵が不正です。');
  const gate=createFheDecryptionGate({owner,signingKeys,datasets:[round.datasetId],recipients:[round.recipient]});
  let generation=0,approved=null;
  return Object.freeze({
    agent:Object.freeze({
      async execute(requestId){
        if(!approved||approved.request.requestId!==requestId||approved.state!=='ready')return Object.freeze({status:'denied',reason:'確認済みの依頼がありません。'});
        const ticket=approved;ticket.state='used';
        const result=await gate.agent.execute(requestId,ticket.packets);
        if(approved!==ticket||ticket.generation!==generation)return Object.freeze({status:'denied',reason:'確認が取り消されました。'});
        return result;
      }
    }),
    async approve(bundles){
      const snapshot=structuredClone(bundles),revision=++generation;approved=null;gate.cancel();
      const checked=await verifyFheContributions(snapshot,round,roster);
      if(generation!==revision)throw new Error('確認が取り消されました。');
      // The signed round ID is also the decryption request ID, so the
      // attested aggregate cannot be transplanted to another round.
      const request=await gate.approve(checked.packets,round.datasetId,round.recipient,round.roundId);
      if(generation!==revision)throw new Error('確認が取り消されました。');
      approved={request,packets:checked.packets,generation:revision,state:'ready'};
      return request;
    },
    cancel(){generation++;approved=null;gate.cancel();}
  });
}
