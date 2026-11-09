import { requestFor } from '../src/authorization.js';
import { dispatchEgress } from '../src/information-flow.js';

// This CLI transport is restricted to Ollama on IPv4 loopback. The local
// service and model remain trusted components and could themselves send data.
export function createAgentLocalTransport(gateway,fetchImpl=fetch){
  return Object.freeze({async request(endpoint,path,body,{consented=false,expectedRevision=gateway.revision,timeout=8000}={}){
    if(endpoint!=='http://127.0.0.1:11434'||!['/api/show','/api/generate'].includes(path))throw new Error('登録されていないAI接続先です。');
    if(!Number.isInteger(timeout)||timeout<1||timeout>120000)throw new Error('AI接続の待ち時間が不正です。');
    const wire=JSON.stringify(body);
    if(typeof wire!=='string')throw new Error('AIへ渡すデータが不正です。');
    const request=requestFor('infer','local-ai','confidential',{fresh:gateway.revision===expectedRevision,loopback:true,consented});
    const response=await dispatchEgress(request,{private:wire},{'local-ai':value=>fetchImpl(endpoint+path,{method:'POST',headers:{'Content-Type':'application/json'},body:value,redirect:'error',signal:AbortSignal.timeout(timeout)})});
    if(!response.ok)throw new Error(`ローカルAIに接続できませんでした（${response.status}）。`);
    return response.json();
  }});
}
