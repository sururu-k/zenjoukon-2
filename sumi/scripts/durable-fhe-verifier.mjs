import { DatabaseSync } from 'node:sqlite';
import { open, lstat, rm } from 'node:fs/promises';
import { canonical, hash } from '../src/crypto.js';
import { verifyFheRoundResult } from '../src/secure/verified-fhe-round.js';

// One shared SQLite database provides atomic at-most-once acceptance for its
// clients. It does not prove that an external side effect occurred, and a
// restored or replaced old database may lose history.
const fail=()=>{throw new Error('使用済み台帳または集計回が不正です。');};
const validId=v=>typeof v==='string'&&/^[a-zA-Z0-9_-]{16,80}$/.test(v);
function configure(db){db.exec('PRAGMA busy_timeout=5000; PRAGMA synchronous=FULL;');}

export async function initializeFheReplayLedger(path){
  if(typeof path!=='string'||!path||path===':memory:')fail();
  const file=await open(path,'wx',0o600);await file.close();
  let db;
  try {
    db=new DatabaseSync(path,{timeout:5000});configure(db);
    db.exec('CREATE TABLE ledger_meta (id TEXT PRIMARY KEY, version INTEGER NOT NULL) STRICT; CREATE TABLE used_rounds (round_id TEXT PRIMARY KEY, context_hash TEXT NOT NULL) STRICT;');
    const ledgerId=crypto.randomUUID();
    db.prepare('INSERT INTO ledger_meta (id,version) VALUES (?,1)').run(ledgerId);
    db.close();db=null;
    return Object.freeze({ledgerId});
  } catch(error) {if(db)db.close();await rm(path,{force:true});throw error;}
}

export async function openFheReplayLedger(path,expectedLedgerId){
  if(typeof path!=='string'||!path||path===':memory:'||!validId(expectedLedgerId))fail();
  const info=await lstat(path);
  if(!info.isFile()||info.isSymbolicLink()||(info.mode&0o077)!==0)fail();
  const db=new DatabaseSync(path,{timeout:5000});
  try {
    configure(db);
    const rows=db.prepare('SELECT id,version FROM ledger_meta').all();
    if(rows.length!==1||rows[0].id!==expectedLedgerId||rows[0].version!==1)fail();
    const insert=db.prepare('INSERT INTO used_rounds (round_id,context_hash) VALUES (?,?) ON CONFLICT(round_id) DO NOTHING');
    let closed=false;
    return Object.freeze({
      async verifyAndConsume(input,expectedRound,expectedRequest,expectedParticipants,decryptorTrust){
        if(closed)throw new Error('使用済み台帳は閉じています。');
        const result=structuredClone(input),round=structuredClone(expectedRound),request=structuredClone(expectedRequest),participants=structuredClone(expectedParticipants),trust=structuredClone(decryptorTrust);
        const verified=await verifyFheRoundResult(result,round,request,participants,trust);
        const contextHash=await hash(canonical({round,request,participants,trust}));
        if(closed)throw new Error('使用済み台帳は閉じています。');
        // One atomic INSERT decides the winner, including across processes.
        if(insert.run(round.roundId,contextHash).changes!==1)throw new Error('この集計回は使用済みです。');
        return verified;
      },
      close(){if(!closed){closed=true;db.close();}}
    });
  }catch(error){db.close();throw error;}
}
