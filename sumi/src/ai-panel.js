import { createLocalAITransport } from './browser-effects.js';
import { createLocalAssistant } from './local-assistant.js';
export const AI_PANEL_IDS=Object.freeze(['ai-endpoint','ai-model','ai-connect','ai-consent','ai-message']);
export function bindLocalAI(workspace,notify,onChange=()=>{}){
  const get=id=>document.getElementById(id),assistant=createLocalAssistant(workspace,createLocalAITransport(workspace));let models=[];
  function reset(){models=[];get('ai-model').replaceChildren(new Option('接続後に選択',''));get('ai-model').disabled=true;workspace.clear();onChange();get('ai-message').textContent='未接続';}
  get('ai-endpoint').addEventListener('input',reset);
  for(const id of ['ai-model','ai-consent'])get(id).addEventListener('change',()=>{workspace.clear();onChange();});
  get('ai-connect').addEventListener('click',async()=>{const button=get('ai-connect');button.disabled=true;reset();const revision=workspace.revision,endpoint=get('ai-endpoint').value.trim();try{const available=await assistant.models(endpoint);if(revision!==workspace.revision||get('ai-endpoint').value.trim()!==endpoint)throw new Error('設定や入力が変わったため、接続結果を破棄しました。');models=available;if(!models.length)throw new Error('利用できるローカルモデルがありません。');get('ai-model').replaceChildren(...models.map(name=>new Option(name,name)));get('ai-model').disabled=false;get('ai-message').textContent=`${models.length}件のローカルモデル`;notify('モデルを選び、利用する場合は同意にチェックしてください。');}catch(err){notify(err.message,true);get('ai-message').textContent='接続できませんでした';}finally{button.disabled=false;}});
  return Object.freeze({async generate(spec){const model=get('ai-model').value;if(!models.includes(model))throw new Error('ローカルAIへ接続し、モデルを選んでください。');return assistant.generate(get('ai-endpoint').value.trim(),model,spec,get('ai-consent').checked);}});
}
