#!/usr/bin/env node
import { readFile, stat, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Writable } from 'node:stream';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout, stderr } from 'node:process';
import { sealSchoolContributions, sealPartyTotal, openCombinedTotal, sealSurveyBallot, sealSurveyTotal, openSurveyTotal } from '../src/secure/mpc-file.js';
import { requestFor } from '../src/authorization.js';
import { dispatchEgress } from '../src/information-flow.js';

const usage='使い方: school-study.mjs split <数値.json> <集計ID> <新規フォルダ> | aggregate <A|B> <出力> <入力1> <入力2> [...] | combine <A合算> <B合算> | survey-vote <集計ID> <新規フォルダ> | survey-aggregate <A|B> <集計ID> <出力> <入力1> <入力2> <入力3> [...] | survey-result <A合算> <B合算>';
async function readJson(path,max){const info=await stat(path);if(!info.isFile()||info.size>max)throw new Error('入力ファイルの種類またはサイズが不正です。');return JSON.parse(await readFile(path,'utf8'));}
async function secret(prompt){
  if(!stdin.isTTY||!stdout.isTTY)throw new Error('パスフレーズ入力には対話可能な端末が必要です。');
  stdout.write(prompt);
  const muted=new Writable({write(_chunk,_encoding,done){done();}});
  const rl=createInterface({input:stdin,output:muted,terminal:true});
  try{return await rl.question('');}finally{rl.close();stdout.write('\n');}
}
async function save(path,value){
  const request=requestFor('saveEncrypted','encrypted-draft','confidential',{fresh:true,encrypted:true});
  return dispatchEgress(request,{sealed:value},{'encrypted-draft':data=>writeFile(path,JSON.stringify(data)+'\n',{flag:'wx',mode:0o600})});
}
async function main(){
  const [command,...args]=process.argv.slice(2);
  if(command==='survey-vote'&&args.length===2){
    const [campaign,folder]=args;
    stdout.write('昼休みに図書室を開けてほしいですか？ 回答を２つの暗号化ファイルに分けます。\n');
    const choice=(await secret('開けてほしい y / 今のままでよい n：')).trim().toLowerCase();
    if(!['y','n'].includes(choice))throw new Error('回答は y または n で入力してください。');
    const a=await secret('A用パスフレーズ（12文字以上）：'),b=await secret('B用パスフレーズ（12文字以上・Aとは別）：');
    const ballot=await sealSurveyBallot(choice==='y',campaign,a,b);
    await mkdir(folder,{mode:0o700});await save(join(folder,'A.sumi'),ballot.A);await save(join(folder,'B.sumi'),ballot.B);
    stdout.write('暗号化ファイルを作成しました。AとBを別々の担当者に渡してください。\n');return;
  }
  if(command==='survey-aggregate'&&args.length>=6){
    const [party,campaign,output,...paths]=args;
    if(!['A','B'].includes(party)||paths.length>100)throw new Error(usage);
    stdout.write(`${party}担当の回答 ${paths.length} 件を合算します。３件以上が必要です。\n`);
    const password=await secret(`${party}用パスフレーズ：`),envelopes=[];
    for(const path of paths)envelopes.push(await readJson(path,3000000));
    await save(output,await sealSurveyTotal(envelopes,party,campaign,password));
    stdout.write('担当者の合算値を暗号化して保存しました。\n');return;
  }
  if(command==='survey-result'&&args.length===2){
    stdout.write('２担当者の合算値を復元します。結果には回答件数と各選択肢の件数が含まれます。\n');
    const a=await secret('A用パスフレーズ：'),b=await secret('B用パスフレーズ：');
    const result=await openSurveyTotal(await readJson(args[0],3000000),a,await readJson(args[1],3000000),b);
    stdout.write(`回答 ${result.count}件 / 開けてほしい ${result.yes}件 / 今のままでよい ${result.no}件\n`);
    stdout.write('回答者の重複や身元は確認していません。少人数や繰り返しの集計から回答が推測される場合があります。\n');return;
  }
  if(command==='split'&&args.length===3){
    const [input,campaign,folder]=args,data=await readJson(input,100000);
    if(!data||!Array.isArray(data.values))throw new Error('数値入力は values 配列を含むJSONにしてください。');
    stdout.write('学校の合計をA・Bの２つの暗号化ファイルに分けます。担当者を分け、パスフレーズも別経路で渡してください。\n');
    const a=await secret('A用パスフレーズ（12文字以上）：'),b=await secret('B用パスフレーズ（12文字以上・Aとは別）：');
    const sealed=await sealSchoolContributions(data.values,campaign,a,b);
    await mkdir(folder,{mode:0o700});
    await save(join(folder,'A.sumi'),sealed.A);await save(join(folder,'B.sumi'),sealed.B);
    stdout.write('暗号化ファイルを作成しました。AとBを別の担当者に渡してください。\n');return;
  }
  if(command==='aggregate'&&args.length>=4){
    const [party,output,...paths]=args;
    if(!['A','B'].includes(party)||paths.length>100)throw new Error(usage);
    stdout.write(`${party}担当者のファイルを ${paths.length} 組合算します。同じ集計IDと担当者のファイルが必要です。\n`);
    const password=await secret(`${party}用パスフレーズ：`),envelopes=[];
    for(const path of paths)envelopes.push(await readJson(path,3000000));
    const result=await sealPartyTotal(envelopes,party,password);await save(output,result);
    stdout.write('合算した暗号化ファイルを保存しました。\n');return;
  }
  if(command==='combine'&&args.length===2){
    stdout.write('両担当者の合算値を復元します。結果には回答件数・提出組数・合計・平均が含まれます。\n');
    const a=await secret('A用パスフレーズ：'),b=await secret('B用パスフレーズ：');
    const result=await openCombinedTotal(await readJson(args[0],3000000),a,await readJson(args[1],3000000),b);
    stdout.write(`提出組数：${result.contributors} / 件数：${result.count} / 合計：${result.sum} / 平均：${result.mean}\n`);
    stdout.write('提出元の学校の数や身元は確認していません。少人数や複数回の集計は、元の値の推測につながる場合があります。\n');return;
  }
  throw new Error(usage);
}
main().catch(error=>{stderr.write(`${error.message}\n`);process.exitCode=1;});
