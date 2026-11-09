import {constants} from 'node:fs';
import {open} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {inspectStoragePath} from './storage-inspection.mjs';
import {isWellFormedUnicode,validateSchoolPolicy} from '../src/school-policy-contract.js';

// This command protects its own export path, not other programs or the OS.
const fail=message=>{throw new Error(message);};
const utf8=(bytes,label)=>{try{return new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{fail(`${label}は正しいUTF-8で指定してください。`);}};
const filename=name=>typeof name==='string'&&isWellFormedUnicode(name)&&name.length>0&&name.length<=128&&name!=='.'&&name!=='..'&&!/[\/\\\x00-\x1f\x7f]/.test(name);
async function readLocal(path,limit){
  const file=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);
  try{
    const info=await file.stat();
    if(!info.isFile()||info.size>limit)fail('入力の種類またはサイズが不正です。');
    const data=await file.readFile();if(data.length>limit)fail('入力が大きすぎます。');return data;
  }finally{await file.close();}
}
async function main(){
  const [command,root,input,output,token,...extra]=process.argv.slice(2);
  if(extra.length||!['inspect','release'].includes(command)||!root||!filename(input)||!filename(output)||
    (command==='inspect'&&token)||(command==='release'&&!/^[a-f0-9]{64}$/.test(token||'')))
    fail('使い方: node scripts/school-workspace-release.mjs inspect <作業フォルダー> <入力名> <出力名> | release <作業フォルダー> <入力名> <出力名> <確認トークン>');
  if(process.platform==='win32')fail('この試作はPOSIX権限を持つ環境で使用してください。');
  for(const path of [root,join(root,'incoming'),join(root,'output'),join(root,'school-policy.json')]){
    const observation=await inspectStoragePath(path);
    if(observation.result!=='basic-mode-ok')fail('作業場所または設定の所有者・基本権限を確認してください。');
  }
  const policyBytes=await readLocal(join(root,'school-policy.json'),1024*1024);
  const policy=validateSchoolPolicy(JSON.parse(utf8(policyBytes,'設定')));
  const bytes=await readLocal(join(root,'incoming',input),512);
  const text=utf8(bytes,'文書');
  if(!text.trim())fail('文書を入力してください。');
  if(policy.documentProof.forbidden.some(word=>text.includes(word)))fail('文書に指定した禁止語が含まれています。');
  const hash=data=>createHash('sha256').update(data).digest('hex');
  const expected=hash(JSON.stringify({version:1,document:hash(bytes),policy:hash(policyBytes),output}));
  if(command==='inspect'){
    console.log(JSON.stringify({document:text,forbidden:policy.documentProof.forbidden,output,confirmation:expected},null,2));
    console.log('文書・禁止語・出力名を確認し、表示されたトークンを release に指定してください。');
    return;
  }
  if(token!==expected)fail('確認後に文書・設定・出力名が変わったか、トークンが違います。');
  const file=await open(join(root,'output',output),constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
  try{await file.writeFile(bytes);}finally{await file.close();}
  console.log('確認した文書を出力しました。');
}
main().catch(error=>{console.error(error.code==='EEXIST'?'出力先が既に存在します。':error.message);process.exitCode=1;});
