import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {validateSchoolPolicy} from '../src/school-policy-contract.js';

// Creates a new local directory only; never changes an existing directory.
async function main(){
  const args=process.argv.slice(2);
  if(args.length!==2||args.some(x=>!x||x.startsWith('-')))throw new Error('使い方: node scripts/school-workspace.mjs <共通設定.json> <新しい作業フォルダー>');
  if(process.platform==='win32')throw new Error('この試作はPOSIX権限を持つ環境で使用してください。');
  const [policyPath,target]=args;
  const bytes=await readFile(policyPath);
  if(bytes.length>1024*1024)throw new Error('共通設定は1 MiB以内にしてください。');
  let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{throw new Error('共通設定は正しいUTF-8で指定してください。');}
  const policy=validateSchoolPolicy(JSON.parse(text));
  let created=false;
  try{
    await mkdir(target,{mode:0o700});created=true;
    for(const name of ['incoming','reviewed','output'])await mkdir(join(target,name),{mode:0o700});
    await writeFile(join(target,'school-policy.json'),JSON.stringify(policy,null,2)+'\n',{flag:'wx',mode:0o600});
    const physical=policy.assessment.controls.filter(c=>c.area==='physical');
    const checklist=['物理面の点検（自己確認用）','',...physical.flatMap(c=>[`[ ] ${c.title}`,`    目的：${c.purpose}`,''])].join('\n');
    await writeFile(join(target,'physical-checklist.txt'),checklist,{flag:'wx',mode:0o600});
    const guidance=['架空データ用の作業場所','incoming: 受け取った文書','reviewed: 人が確認した文書','output: 共有する文書','',
      'フォルダー間の移動や確認は自動ではありません。ポリシーを強制する仕組みではありません。',
      '所有者・基本権限以外にACL、親フォルダー、OS、同じ利用者の他のプロセスにも依存します。実際の個人情報は扱わないでください。',''].join('\n');
    await writeFile(join(target,'README.txt'),guidance,{flag:'wx',mode:0o600});
  }catch(error){
    if(error.code==='EEXIST'&&!created)throw new Error('保存先が既に存在します。別の名前を指定してください。');
    if(created)throw new Error('途中で作成できなくなりました。作成先を確認してください。');
    throw error;
  }
  console.log('架空データ用の作業フォルダー、共通設定、物理点検表を作成しました。');
  console.log('点検表は自己確認用です。アクセス制御・承認・情報漏洩の不在を保証するものではありません。');
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
