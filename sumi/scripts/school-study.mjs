#!/usr/bin/env node
import { readFile, stat, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Writable } from 'node:stream';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout, stderr } from 'node:process';
import { sealSchoolContributions, sealPartyTotal, openCombinedTotal } from '../src/secure/mpc-file.js';
import { requestFor } from '../src/authorization.js';
import { dispatchEgress } from '../src/information-flow.js';

const usage='使い方: node scripts/school-study.mjs split <数値.json> <集計ID> <新しい出力フォルダ> | aggregate <A|B> <出力.sumi> <入力1.sumi> <入力2.sumi> [...] | combine <A合算.sumi> <B合算.sumi>';
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
    stdout.write(`${party}担当者のファイルを ${paths.length} 校分合算します。同じ集計IDと担当者のファイルが必要です。\n`);
    const password=await secret(`${party}用パスフレーズ：`),envelopes=[];
    for(const path of paths)envelopes.push(await readJson(path,3000000));
    const result=await sealPartyTotal(envelopes,party,password);await save(output,result);
    stdout.write('合算した暗号化ファイルを保存しました。\n');return;
  }
  if(command==='combine'&&args.length===2){
    stdout.write('両担当者の合算値を復元します。結果には件数・学校数・合計・平均が含まれます。\n');
    const a=await secret('A用パスフレーズ：'),b=await secret('B用パスフレーズ：');
    const result=await openCombinedTotal(await readJson(args[0],3000000),a,await readJson(args[1],3000000),b);
    stdout.write(`学校数：${result.contributors} / 件数：${result.count} / 合計：${result.sum} / 平均：${result.mean}\n`);
    stdout.write('少人数や複数回の集計は、元の値の推測につながる場合があります。\n');return;
  }
  throw new Error(usage);
}
main().catch(error=>{stderr.write(`${error.message}\n`);process.exitCode=1;});
