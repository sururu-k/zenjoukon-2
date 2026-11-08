// 外部へ値を渡すブラウザAPIは、このファイルからだけ使用する。
import { createWorkspace } from './workspace.js';
import { decide, requestFor } from './authorization.js';
import { AuthorizationError } from './workspace.js';
import { validateEndpoint } from './privacy.js';
import { dispatchEgress } from './information-flow.js';

const copy=async text=>{if(!navigator.clipboard?.writeText)throw new Error('このブラウザではコピーを利用できません。');await navigator.clipboard.writeText(text);};
function download(name,data){
  const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
  const link=document.createElement('a');link.href=url;link.download=name;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);
}
export function createBrowserWorkspace(audit){return createWorkspace({copy,download,audit});}

export function createLocalAITransport(workspace) {
  async function request(endpoint,path,body,{consented=false,signal,timeout=8000,expectedRevision=workspace.revision}={}){
    const origin=validateEndpoint(endpoint);
    if(!Number.isInteger(timeout)||timeout<1||timeout>120000)throw new Error('AI接続の待ち時間が不正です。');
    if(!['/api/tags','/api/show','/api/generate'].includes(path))throw new AuthorizationError({code:'destination',reason:'登録されていないAI操作です。'});
    // Serialize before the freshness check. No getter/toJSON on a caller's
    // object may change the workspace after the check but before fetch.
    const wireBody=body===undefined?undefined:JSON.stringify(body);
    if(body!==undefined&&typeof wireBody!=='string')throw new Error('AIへ渡すデータが不正です。');
    const request=requestFor('infer','local-ai',wireBody===undefined?'public':'confidential',{fresh:workspace.revision===expectedRevision,loopback:true,consented});
    const decision=decide(request);
    if(!decision.allow)throw new AuthorizationError(decision);
    const res=await dispatchEgress(request,{private:wireBody},{'local-ai':value=>fetch(origin+path,{method:value===undefined?'GET':'POST',headers:value===undefined?{}:{'Content-Type':'application/json'},body:value,signal:signal||AbortSignal.timeout(timeout),credentials:'omit',redirect:'error',referrerPolicy:'no-referrer'})});
    if(!res.ok)throw new Error(`Ollamaから応答を得られませんでした（${res.status}）。`);
    return res.json();
  }
  return Object.freeze({request});
}
