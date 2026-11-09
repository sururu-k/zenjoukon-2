import { readFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { stdin, stdout } from 'node:process';
import { SCHOOL_POLICY, assessSchoolPolicy, generateConfigurationDraft } from '../src/school-policy.js';
import { validateSchoolPolicy } from '../src/school-policy-contract.js';
import { inspectStoragePath } from './storage-inspection.mjs';

async function walkthrough(policy){
  const observations=Object.create(null),controls=policy.controls;
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
  const report=assessSchoolPolicy(policy,observations);
  stdout.write('\n点検結果（自己申告）\n');
  for(const item of report.results)stdout.write(`${item.status==='reported-met'?'確認済み':item.status==='reported-unmet'?'未対応':'未確認'}：${item.title}\n`);
  stdout.write(report.complete?'全必須項目が確認済みと報告されました。実環境の証明ではありません。\n':'未対応・未確認の項目を担当者と確認してください。\n');
  if(!report.complete)process.exitCode=2;
}
try {
  const args=process.argv.slice(2);
  let policy=SCHOOL_POLICY;
  if(args[0]==='--policy'){
    if(!args[1] || args[1].startsWith('--'))throw new Error('共通設定のJSONファイルを指定してください。');
    const policyText=await readFile(args[1],'utf8');
    if(Buffer.byteLength(policyText,'utf8')>1024*1024)throw new Error('共通設定は1 MiB以内にしてください。');
    policy=validateSchoolPolicy(JSON.parse(policyText)).assessment;
    args.splice(0,2);
  }
  const [command, file, extra, ...rest]=args;
  const invalid=rest.length||!['check','draft','guide','inspect-path','review'].includes(command)||
    (['check','inspect-path'].includes(command)&&(!file||extra))||
    (['guide','draft'].includes(command)&&(file||extra))||
    (command==='review'&&(!file||!extra));
  if(invalid)throw new Error('使い方: node scripts/school-audit.mjs [--policy 共通設定.json] guide | check <確認結果.json> | draft | inspect-path <保存先> | review <確認結果.json> <保存先>');
  if(command==='guide')await walkthrough(policy);
  else if(command==='inspect-path'){
    const output=await inspectStoragePath(file);
    process.stdout.write(JSON.stringify(output,null,2)+'\n');
    if(output.result!=='basic-mode-ok')process.exitCode=2;
  }
  else if(command==='review'){
    const assessment=assessSchoolPolicy(policy,JSON.parse(await readFile(file,'utf8')));
    const storage=await inspectStoragePath(extra);
    const actions=assessment.results.filter(item=>item.required&&item.status!=='reported-met').map(item=>({
      control:item.id,source:'self-reported',reason:item.status==='unknown'?'未確認':'未対応',
      next:`${item.title}を担当者に確認する`
    }));
    if(storage.result==='review-needed')actions.push({control:'least_privilege',source:'observed-posix-mode',reason:'保存先の所有者または基本権限を要確認',next:'保存先の所有者とアクセス権を管理者に確認する'});
    const output={format:'sumi-school-review',version:1,assessment,storage,actions,
      note:'自己申告と指定した１箇所の権限情報です。学校全体の適合性や漏洩の不在は証明しません。'};
    stdout.write(JSON.stringify(output,null,2)+'\n');
    if(actions.length)process.exitCode=2;
  }
  else{
    const output=command==='draft'?generateConfigurationDraft(policy):assessSchoolPolicy(policy,JSON.parse(await readFile(file,'utf8')));
    process.stdout.write(JSON.stringify(output,null,2)+'\n');
    if(command==='check'&&!output.complete)process.exitCode=2;
  }
}catch(error){process.stderr.write((error.message||'処理に失敗しました。')+'\n');process.exitCode=1;}
