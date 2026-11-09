import { readFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { stdin, stdout } from 'node:process';
import { SCHOOL_POLICY, assessSchoolPolicy, generateConfigurationDraft } from '../src/school-policy.js';
import { inspectStoragePath } from './storage-inspection.mjs';

const [command, file, extra]=process.argv.slice(2);
async function walkthrough(){
  const observations=Object.create(null),controls=SCHOOL_POLICY.controls;
  stdout.write('学校の情報を守る点検\n確認した内容を自分で入力します。実際の設定の自動確認や適用は行いません。\n\n');
  let index=0;
  const prompt=()=>{const c=controls[index];stdout.write(`${index+1}/${controls.length} ${c.title}\n理由：${c.purpose}\n確認済み y / 未対応 n / 分からない ?：`);};
  prompt();
  const lines=createInterface({input:stdin,crlfDelay:Infinity});
  try {
    for await(const line of lines){
      const answer=line.trim().toLowerCase();
      if(!['y','n','?'].includes(answer)){stdout.write('y、n、? のいずれかを入力してください。\n');prompt();continue;}
      observations[controls[index].id]=answer==='?'?null:answer==='y';index++;
      if(index===controls.length)break;
      stdout.write('\n');prompt();
    }
  }finally{lines.close();}
  if(index!==controls.length)throw new Error('すべての項目を確認する前に入力が終了しました。');
  const report=assessSchoolPolicy(SCHOOL_POLICY,observations);
  stdout.write('\n点検結果（自己申告）\n');
  for(const item of report.results)stdout.write(`${item.status==='reported-met'?'確認済み':item.status==='reported-unmet'?'未対応':'未確認'}：${item.title}\n`);
  stdout.write(report.complete?'全必須項目が確認済みと報告されました。実環境の証明ではありません。\n':'未対応・未確認の項目を担当者と確認してください。\n');
  if(!report.complete)process.exitCode=2;
}
try {
  if(extra||!['check','draft','guide','inspect-path'].includes(command)||['check','inspect-path'].includes(command)&&!file||!['check','inspect-path'].includes(command)&&file)throw new Error('使い方: node scripts/school-audit.mjs guide | check <確認結果.json> | draft | inspect-path <保存先>');
  if(command==='guide')await walkthrough();
  else if(command==='inspect-path'){
    const output=await inspectStoragePath(file);
    process.stdout.write(JSON.stringify(output,null,2)+'\n');
    if(output.result!=='basic-mode-ok')process.exitCode=2;
  }
  else{
    const output=command==='draft'?generateConfigurationDraft(SCHOOL_POLICY):assessSchoolPolicy(SCHOOL_POLICY,JSON.parse(await readFile(file,'utf8')));
    process.stdout.write(JSON.stringify(output,null,2)+'\n');
    if(command==='check'&&!output.complete)process.exitCode=2;
  }
}catch(error){process.stderr.write((error.message||'処理に失敗しました。')+'\n');process.exitCode=1;}
