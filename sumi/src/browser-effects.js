// 外部へ値を渡すブラウザAPIは、このファイルからだけ使用する。
import { createWorkspace } from './workspace.js';
import { decide, requestFor } from './authorization.js';
import { AuthorizationError } from './workspace.js';
import { validateEndpoint } from './privacy.js';

const copy=async text=>{if(!navigator.clipboard?.writeText)throw new Error('このブラウザではコピーを利用できません。');await navigator.clipboard.writeText(text);};
function download(name,data){
  const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
  const link=document.createElement('a');link.href=url;link.download=name;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);
}
export function createBrowserWorkspace(audit){return createWorkspace({copy,download,audit});}

export function createLocalAITransport(workspace) {
  async function request(endpoint,path,body,{consented=false,signal,timeout=8000,expectedRevision=workspace.revision}={}){
    const origin=validateEndpoint(endpoint);
    const decision=decide(requestFor('infer','local-ai',body?.prompt?'confidential':'public',{fresh:workspace.revision===expectedRevision,loopback:true,consented}));
    if(!decision.allow)throw new AuthorizationError(decision);
    if(!['/api/tags','/api/show','/api/generate'].includes(path))throw new AuthorizationError({code:'destination',reason:'登録されていないAI操作です。'});
    const res=await fetch(origin+path,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined,signal:signal||AbortSignal.timeout(timeout),credentials:'omit',redirect:'error',referrerPolicy:'no-referrer'});
    if(!res.ok)throw new Error(`Ollamaから応答を得られませんでした（${res.status}）。`);
    return res.json();
  }
  return Object.freeze({request});
}
