import { openFheReplayLedger } from '../../scripts/durable-fhe-verifier.mjs';

process.on('message',async message=>{
  let ledger;
  try {
    ledger=await openFheReplayLedger(message.path,message.ledgerId);
    await ledger.verifyAndConsume(message.result,message.round,message.request,message.participants,message.trust);
    process.send({status:'accepted'});
  } catch { process.send({status:'rejected'}); }
  finally {ledger?.close();process.disconnect();}
});
process.send({status:'ready'});
