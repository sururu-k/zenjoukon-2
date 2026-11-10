import { createFheRequest, createFheAggregateAttestation } from './fhe-attestation.js';

// API boundary only: the trusted owner keeps the raw decryptor and approve()
// methods away from the agent. This does not enforce OS/process isolation.
export function createFheDecryptionGate({owner,signingKeys,datasets,recipients,minimumCount=3}) {
  const validList=v=>Array.isArray(v)&&v.length>0&&v.length<=50&&v.every(x=>typeof x==='string'&&/^[a-zA-Z0-9_-]{1,80}$/.test(x))&&new Set(v).size===v.length;
  if(!owner||typeof owner.decrypt!=='function'||typeof owner.keyId!=='string'||!/^[0-9a-f]{64}$/.test(owner.keyId)||!Array.isArray(signingKeys)||signingKeys.length<1||signingKeys.length>10||!validList(datasets)||!validList(recipients)||!Number.isInteger(minimumCount)||minimumCount<3||minimumCount>1000)throw new Error('復号ゲートの設定が不正です。');
  const allowedDatasets=new Set(datasets),allowedRecipients=new Set(recipients),keys=signingKeys.map(pair=>Object.freeze({publicKey:pair.publicKey,privateKey:pair.privateKey}));
  let generation=0,approval=null;
  const denied=reason=>Object.freeze({status:'denied',reason});
  const agent=Object.freeze({
    async execute(requestId,inputPackets){
      if(typeof requestId!=='string'||!approval||approval.request.requestId!==requestId||approval.state!=='ready')return denied('確認済みの依頼がありません。');
      const ticket=approval;ticket.state='inflight';
      const current=()=>approval===ticket&&ticket.generation===generation&&ticket.state==='inflight';
      try {
        const packets=structuredClone(inputPackets);
        // Re-check immediately before the actual decrypt call, even if an
        // asynchronous ciphertext evaluation was in progress during cancel.
        const restrictedOwner={keyId:owner.keyId,decrypt(total){if(!current())throw new Error('確認が取り消されました。');return owner.decrypt(total);}};
        const envelope=await createFheAggregateAttestation(restrictedOwner,packets,ticket.request,keys);
        if(!current())return denied('確認が取り消されました。');
        return Object.freeze({status:'completed',envelope});
      }catch{return denied('暗号集計または確認を検証できませんでした。');}
      finally{if(approval===ticket)ticket.state='used';}
    }
  });
  return Object.freeze({
    agent,
    async approve(inputPackets,datasetId,recipient){
      const packets=structuredClone(inputPackets),revision=++generation;approval=null;
      if(!allowedDatasets.has(datasetId)||!allowedRecipients.has(recipient))throw new Error('対象または受取先が許可されていません。');
      const request=await createFheRequest(packets,datasetId,recipient,crypto.randomUUID());
      if(generation!==revision||request.keyId!==owner.keyId||request.count<minimumCount)throw new Error('依頼が変更されたか、鍵または件数が不正です。');
      approval={request,generation:revision,state:'ready'};
      return request;
    },
    cancel(){generation++;approval=null;}
  });
}
