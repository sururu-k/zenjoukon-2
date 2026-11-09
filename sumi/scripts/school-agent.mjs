#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout, stderr } from 'node:process';
import { prepareAgentDocument } from '../src/agent-document.js';
import { createAgentAssistant } from '../src/agent-assistant.js';
import { createAgentLocalTransport } from './agent-local-transport.mjs';

const [path, action, ...args]=process.argv.slice(2);
const usage='使い方: node scripts/school-agent.mjs <文書.txt> <read|summarize|send> [--hide-file <語句.txt>] | <文書.txt> summarize-ai <ローカルモデル名> [--hide-file <語句.txt>]';
async function main(){
  if(!path||!['read','summarize','summarize-ai','send'].includes(action))throw new Error(usage);
  const remaining=[...args],model=action==='summarize-ai'?remaining.shift():undefined;
  if(action==='summarize-ai'&&(!model||model.startsWith('--')))throw new Error(usage);
  let hiddenFile;
  if(remaining.length){if(remaining.length!==2||remaining[0]!=='--hide-file'||!remaining[1])throw new Error(usage);hiddenFile=remaining[1];}
  const text=await readFile(path,'utf8');
  const hiddenWords=hiddenFile?await readFile(hiddenFile,'utf8'):'';
  const {gateway,preview,maskedCount}=prepareAgentDocument(text,hiddenWords);
  const proposal={action:action==='summarize-ai'?'read':action,resource:action==='send'?'external-service':'approved-document',revision:gateway.revision};
  const before=await gateway.agent.execute(proposal);
  if(before.status!=='denied')throw new Error('確認前の操作が拒否されませんでした。');
  stdout.write(`確認前の判定：拒否（${before.reason}）\n`);
  stdout.write(`ルール上の判定：${before.event.policyDecision} / 実行結果：${before.event.status}\n`);
  if(action==='send'){
    stdout.write('外部送信の機能はありません。通信は行っていません。\n');
    process.exitCode=2;return;
  }
  const operation=action==='summarize-ai'?`ローカルAI（${model}）による要約。加工版を 127.0.0.1:11434 に送信します。`:action==='summarize'?'先頭３文の抽出':'文書の読み取り';
  stdout.write(`\nエージェントに渡す文書（${maskedCount}箇所を加工）：\n${preview}\n\n候補の検出には漏れがあります。全文を確認してください。\n提案された操作：${operation}\n`);
  const rl=createInterface({input:stdin,output:stdout});let answer;
  try{answer=await rl.question('この版の文書をエージェントに渡す場合は yes と入力: ');}finally{rl.close();}
  if(answer.trim()!=='yes'){stdout.write('操作を取り消しました。\n');process.exitCode=2;return;}
  gateway.approveDocument(proposal.revision);
  if(action==='summarize-ai'){
    const assistant=createAgentAssistant(gateway,createAgentLocalTransport(gateway));
    const summary=await assistant.summarize({endpoint:'http://127.0.0.1:11434',model,revision:proposal.revision,consented:true});
    stdout.write(`\nAIの要約案（人が内容を確認してください）：\n${summary}\n`);
    return;
  }
  const result=await gateway.agent.execute(proposal);
  if(result.status!=='completed')throw new Error(result.reason);
  stdout.write(`ルール上の判定：${result.event.policyDecision} / 実行結果：${result.event.status}\n`);
  stdout.write(`\n操作結果：\n${result.value}\n`);
  stdout.write('※この操作は固定処理です。AI、外部通信、ファイルへの保存は行っていません。\n');
}
main().catch(error=>{stderr.write(`${error.message}\n`);process.exitCode=1;});
