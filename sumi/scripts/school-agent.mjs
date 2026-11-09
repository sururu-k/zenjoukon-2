#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout, stderr } from 'node:process';
import { prepareAgentDocument } from '../src/agent-document.js';

const [path, action, ...extra]=process.argv.slice(2);
const usage='使い方: node scripts/school-agent.mjs <文書.txt> <read|summarize|send>';
async function main(){
  if(!path||!['read','summarize','send'].includes(action)||extra.length)throw new Error(usage);
  const text=await readFile(path,'utf8');
  const {gateway,preview,maskedCount}=prepareAgentDocument(text);
  const proposal={action,resource:action==='send'?'external-service':'approved-document',revision:gateway.revision};
  const before=await gateway.agent.execute(proposal);
  if(before.status!=='denied')throw new Error('確認前の操作が拒否されませんでした。');
  stdout.write(`確認前の判定：拒否（${before.reason}）\n`);
  stdout.write(`ルール上の判定：${before.event.policyDecision} / 実行結果：${before.event.status}\n`);
  if(action==='send'){
    stdout.write('外部送信の機能はありません。通信は行っていません。\n');
    process.exitCode=2;return;
  }
  stdout.write(`\nエージェントに渡す文書（${maskedCount}箇所を加工）：\n${preview}\n\n候補の検出には漏れがあります。全文を確認してください。\n提案された操作：${action==='summarize'?'先頭３文の抽出':'文書の読み取り'}\n`);
  const rl=createInterface({input:stdin,output:stdout});let answer;
  try{answer=await rl.question('この版の文書をエージェントに渡す場合は yes と入力: ');}finally{rl.close();}
  if(answer.trim()!=='yes'){stdout.write('操作を取り消しました。\n');process.exitCode=2;return;}
  gateway.approveDocument(proposal.revision);
  const result=await gateway.agent.execute(proposal);
  if(result.status!=='completed')throw new Error(result.reason);
  stdout.write(`ルール上の判定：${result.event.policyDecision} / 実行結果：${result.event.status}\n`);
  stdout.write(`\n操作結果：\n${result.value}\n`);
  stdout.write('※この操作は固定処理です。AI、外部通信、ファイルへの保存は行っていません。\n');
}
main().catch(error=>{stderr.write(`${error.message}\n`);process.exitCode=1;});
