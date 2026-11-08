import { validateEndpoint } from './privacy.js';
const isLocalModel=m=>m&&typeof m.name==='string'&&/^[a-zA-Z0-9_.:/-]{1,160}$/.test(m.name)&&Number(m.size)>1000000&&!m.remote_host&&!m.remote_model&&!/(?:[:/-]cloud)(?::|$)/i.test(m.name)&&m.details?.format;
export function createLocalAssistant(workspace,transport){
  return Object.freeze({
    async models(endpoint){const value=await transport.request(validateEndpoint(endpoint),'/api/tags',undefined,{consented:true});return (Array.isArray(value.models)?value.models:[]).filter(isLocalModel).map(m=>m.name);},
    async generate(endpoint,model,spec,consented){
      if(consented!==true)throw new Error('この端末のAIを利用することに同意してください。');
      if(typeof model!=='string'||!/^[a-zA-Z0-9_.:/-]{1,160}$/.test(model)||/(?:[:/-]cloud)(?::|$)/i.test(model))throw new Error('ローカルモデルを選んでください。');
      const expectedRevision=workspace.revision,origin=validateEndpoint(endpoint);
      const details=await transport.request(origin,'/api/show',{model},{consented:true,expectedRevision});
      if(details.remote_host||details.remote_model||!details.model_info||!Object.keys(details.model_info).length)throw new Error('端末内にモデルの重みがあることを確認できません。');
      if(workspace.revision!==expectedRevision)throw new Error('入力が変わったため、AIへの送信を取り消しました。');
      const response=await transport.request(origin,'/api/generate',{model,system:spec.system,prompt:spec.prompt,format:spec.schema,stream:false,options:{temperature:0,num_predict:2200}},{consented:true,expectedRevision,timeout:90000});
      if(workspace.revision!==expectedRevision)throw new Error('入力が変わったため、AIの提案を破棄しました。');
      if(typeof response.response!=='string'||response.response.length>60000)throw new Error('AIの応答形式を確認してください。');
      try{return JSON.parse(response.response);}catch{throw new Error('AIが指定した形式のJSONを返しませんでした。');}
    }
  });
}
