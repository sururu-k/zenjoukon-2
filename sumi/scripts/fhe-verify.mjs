#!/usr/bin/env node
import { open } from 'node:fs/promises';
import { initializeFheReplayLedger, openFheReplayLedger } from './durable-fhe-verifier.mjs';

const usage='使い方: node scripts/fhe-verify.mjs init <台帳.sqlite> | verify <結果.json> <期待条件.json> <台帳.sqlite> <台帳ID>';
const own=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
async function readJson(path,limit){
  const file=await open(path,'r');
  try {
    const info=await file.stat();if(!info.isFile()||info.size>limit)throw new Error('入力ファイルの種類またはサイズが不正です。');
    const bytes=await file.readFile();if(bytes.length>limit)throw new Error('入力ファイルが大きすぎます。');
    return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
  } finally {await file.close();}
}

async function main(args){
  if(args.length===1&&args[0]==='--help'){console.log(usage);return;}
  if(args.length===2&&args[0]==='init'){
    const created=await initializeFheReplayLedger(args[1]);
    console.log(JSON.stringify({format:'sumi-fhe-ledger-id',version:1,ledgerId:created.ledgerId}));
    return;
  }
  if(args.length!==5||args[0]!=='verify')throw new Error(usage);
  const [,resultPath,contextPath,ledgerPath,ledgerId]=args;
  const result=await readJson(resultPath,32*1024*1024),context=await readJson(contextPath,1024*1024);
  if(!own(context,['format','version','round','request','participants','decryptorTrust'])||context.format!=='sumi-fhe-verification-context'||context.version!==1)throw new Error('期待条件の形式が不正です。');
  const ledger=await openFheReplayLedger(ledgerPath,ledgerId);
  try {
    const verified=await ledger.verifyAndConsume(result,context.round,context.request,context.participants,context.decryptorTrust);
    console.log(JSON.stringify({status:'verified',...verified}));
  } finally {ledger.close();}
}
main(process.argv.slice(2)).catch(error=>{process.stderr.write(`${error.message||'検証に失敗しました。'}\n`);process.exitCode=1;});
