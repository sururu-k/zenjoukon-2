import {createServer} from 'node:http';
import {readFile,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,extname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

const ROOT=fileURLToPath(new URL('../',import.meta.url));
const execute=promisify(execFile);
const TYPES={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8'};
const ASSETS={'/':'document-live/public/index.html','/app.js':'document-live/public/app.js','/styles.css':'document-live/public/styles.css','/suite.css':'src/suite.css'};
const json=(res,status,body)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(body));};
async function readJson(req){
  let size=0;const chunks=[];
  for await(const chunk of req){size+=chunk.length;if(size>200000)throw new Error('入力が大きすぎます。');chunks.push(chunk);}
  let text;
  try{text=new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks));}
  catch{throw new Error('入力は正しいUTF-8で指定してください。');}
  return JSON.parse(text);
}
async function runProof(body,mode){
  const dir=await mkdtemp(join(tmpdir(),'sumi-document-live-'));
  try{
    const script=join(ROOT,'scripts/noir-document-v2.mjs');let args;
    if(mode==='prove'){
      if(typeof body?.text!=='string'||!body.text.isWellFormed()||!Array.isArray(body.terms)||body.terms.some(x=>typeof x!=='string'))throw new Error('文書と禁止語を確認してください。');
      await writeFile(join(dir,'document.txt'),body.text,{mode:0o600});
      await writeFile(join(dir,'policy.json'),JSON.stringify({forbidden:body.terms}),{mode:0o600});
      args=['prove',join(dir,'document.txt'),join(dir,'policy.json'),join(dir,'proof.json'),join(dir,'opening.json')];
    }else{
      if(!body?.proof||typeof body.proof!=='object'||!body?.expected||typeof body.expected!=='object')throw new Error('証明と期待条件を確認してください。');
      await writeFile(join(dir,'proof.json'),JSON.stringify(body.proof),{mode:0o600});
      await writeFile(join(dir,'expected.json'),JSON.stringify(body.expected),{mode:0o600});
      args=['verify',join(dir,'proof.json'),join(dir,'expected.json')];
    }
    try{await execute(process.execPath,[script,...args],{cwd:ROOT,timeout:120000,maxBuffer:100000});}
    catch(error){
      const detail=error.stderr||'';
      if(detail.includes('文書に禁止語が含まれています'))throw new Error('文書に指定した禁止語が含まれています。');
      if(detail.includes('期待条件と一致しません'))throw new Error('証明の公開条件と、入力した期待条件が一致しません。');
      if(detail.includes('バイト')||detail.includes('禁止語は重複'))throw new Error('文書または禁止語の長さ・個数を確認してください。');
      throw new Error('証明処理に失敗しました。ツールの設定と入力を確認してください。');
    }
    if(mode==='verify')return {verified:true};
    return {proof:JSON.parse(await readFile(join(dir,'proof.json'),'utf8')),opening:JSON.parse(await readFile(join(dir,'opening.json'),'utf8'))};
  }finally{await rm(dir,{recursive:true,force:true});}
}

export function startDocumentServer(port=4180){
  let busy=false;
  const server=createServer(async(req,res)=>{
    const host=req.headers.host;
    if(host!==`127.0.0.1:${server.address().port}`){json(res,403,{error:'許可されていない接続先です。'});return;}
    const path=new URL(req.url,'http://127.0.0.1').pathname;
    if(req.method==='GET'&&Object.hasOwn(ASSETS,path)){
      try{const file=join(ROOT,ASSETS[path]),contents=await readFile(file);res.writeHead(200,{'Content-Type':TYPES[extname(file)],'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"});res.end(contents);}catch{json(res,500,{error:'画面を読み込めません。'});}return;
    }
    if(req.method!=='POST'||!['/api/prove','/api/verify'].includes(path)){json(res,404,{error:'見つかりません。'});return;}
    if(req.headers.origin!==`http://${host}`||req.headers['content-type']!=='application/json'){json(res,403,{error:'この画面から操作してください。'});return;}
    if(busy){json(res,429,{error:'別の処理が実行中です。終了後に試してください。'});return;}
    busy=true;
    try{const input=await readJson(req);json(res,200,await runProof(input,path==='/api/prove'?'prove':'verify'));}
    catch(error){json(res,400,{error:error.message||'処理に失敗しました。'});}
    finally{busy=false;}
  });
  return new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',()=>resolve(server));});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const server=await startDocumentServer(Number(process.env.SUMI_DOCUMENT_PORT||4180));
  console.log(`文書の証明: http://127.0.0.1:${server.address().port}/`);
}
