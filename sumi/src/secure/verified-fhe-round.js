import { verifyFheContributions } from './signed-fhe-contributions.js';
import { verifyFheAggregateAttestation } from './fhe-attestation.js';
import { verifierTransition } from './verifier-state.js';

// Expected round, request, roster and decryptor trust are external inputs.
// A correct BFV decrypt is attested by the decryptor, not proved in ZK.
export async function verifyFheRoundResult(input,expectedRound,expectedRequest,expectedParticipants,decryptorTrust){
  const result=structuredClone(input),round=structuredClone(expectedRound),request=structuredClone(expectedRequest),participants=structuredClone(expectedParticipants),trust=structuredClone(decryptorTrust);
  if(!result||typeof result!=='object'||Array.isArray(result)||Object.keys(result).length!==2||!Object.hasOwn(result,'contributions')||!Object.hasOwn(result,'attestation')||!round||!request||request.requestId!==round.roundId||request.datasetId!==round.datasetId||request.recipient!==round.recipient||request.keyId!==round.keyId)throw new Error('期待する集計回と復号依頼が一致しません。');
  const contributions=await verifyFheContributions(result.contributions,round,participants);
  const verified=await verifyFheAggregateAttestation(result.attestation,contributions.packets,request,trust);
  return Object.freeze({...verified,roundId:round.roundId,participants:contributions.participants});
}

// At-most-once acceptance within this single in-memory session only. A caller
// must retain an independent durable replay ledger across restarts or nodes.
export function createFheRoundVerifierSession(expectedRound,expectedRequest,expectedParticipants,decryptorTrust){
  const round=structuredClone(expectedRound),request=structuredClone(expectedRequest),participants=structuredClone(expectedParticipants),trust=structuredClone(decryptorTrust);
  let state='ready';
  return Object.freeze({
    cancel(){const next=verifierTransition(state,'cancel');const changed=next.state!==state;state=next.state;return changed;},
    async verifyAndConsume(input){
      if(state!=='ready')throw new Error('集計回は使用済み、処理中または取消済みです。');
      state=verifierTransition(state,'begin').state;
      try {
        const verified=await verifyFheRoundResult(input,round,request,participants,trust);
        const next=verifierTransition(state,'success');
        state=next.state;
        if(!next.accepted)throw new Error('検証中に集計回が取り消されました。');
        return verified;
      } catch(error) {
        state=verifierTransition(state,'failure').state;
        throw error;
      }
    }
  });
}
