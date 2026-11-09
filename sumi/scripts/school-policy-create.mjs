import { writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { stdin, stdout, stderr } from 'node:process';
import example from '../src/school-policy.example.json' with {type:'json'};
import { validateSchoolPolicy } from '../src/school-policy-contract.js';

async function main(){
  const args=process.argv.slice(2);
  if(args.length!==1||!args[0]||args[0].startsWith('-'))throw new Error('使い方: node scripts/school-policy-create.mjs <新しい設定ファイル.json>');
  stdout.write('架空データで学校別の設定例を作ります。禁止語は文書証明で公開されます。\n');
  stdout.write('学校名：');
  const lines=createInterface({input:stdin,crlfDelay:Infinity});
  const answers=[];
  try{
    for await(const line of lines){
      answers.push(line.trim());
      if(answers.length===1)stdout.write('公開してよい禁止語（１〜４語、読点かカンマで区切る）：');
      if(answers.length===2)break;
    }
  }finally{lines.close();}
  if(answers.length!==2)throw new Error('学校名と禁止語の入力が必要です。');
  const words=answers[1].split(/[、,]/).map(word=>word.trim());
  if(words.some(word=>!word)||new Set(words).size!==words.length)throw new Error('禁止語は空欄や重複を含めずに指定してください。');
  const policy=structuredClone(example);
  policy.school=answers[0];policy.documentProof.forbidden=words;
  validateSchoolPolicy(policy);
  // Do not replace an existing file or follow an existing symlink.
  await writeFile(args[0],JSON.stringify(policy,null,2)+'\n',{flag:'wx',mode:0o600});
  stdout.write('設定例を保存しました。共有範囲と点検項目はサンプルのままです。内容を確認してください。\n');
  stdout.write('署名・承認・配布は行っていません。実際の学校情報には使用しないでください。\n');
}
main().catch(error=>{stderr.write((error.code==='EEXIST'?'保存先が既に存在します。別の名前を指定してください。':error.message)+'\n');process.exitCode=1;});
