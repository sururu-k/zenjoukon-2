import { verifyFheContributions } from './signed-fhe-contributions.js';
import { verifyFheAggregateAttestation } from './fhe-attestation.js';

// Expected round, request, roster and decryptor trust are external inputs.
// A correct BFV decrypt is attested by the decryptor, not proved in ZK.
export async function verifyFheRoundResult(input,expectedRound,expectedRequest,expectedParticipants,decryptorTrust){
  const result=structuredClone(input),round=structuredClone(expectedRound),request=structuredClone(expectedRequest),participants=structuredClone(expectedParticipants),trust=structuredClone(decryptorTrust);
  if(!result||typeof result!=='object'||Array.isArray(result)||Object.keys(result).length!==2||!Object.hasOwn(result,'contributions')||!Object.hasOwn(result,'attestation')||!round||!request||request.requestId!==round.roundId||request.datasetId!==round.datasetId||request.recipient!==round.recipient||request.keyId!==round.keyId)throw new Error('期待する集計回と復号依頼が一致しません。');
  const contributions=await verifyFheContributions(result.contributions,round,participants);
  const verified=await verifyFheAggregateAttestation(result.attestation,contributions.packets,request,trust);
  return Object.freeze({...verified,roundId:round.roundId,participants:contributions.participants});
}
