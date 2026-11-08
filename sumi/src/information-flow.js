import { decide, AuthorizationError } from './authorization.js';

export const CHANNELS=Object.freeze(['none','clipboard','share-file','encrypted-draft','local-ai']);

// This selector is checked against the Lean channel function for every valid
// request. Released, sealed, and private values occupy separate input fields.
export function channelFor(request){
  if(!decide(request).allow)return 'none';
  return {copy:'clipboard',export:'share-file',saveEncrypted:'encrypted-draft',infer:'local-ai'}[request.action];
}

export function selectEgress(request,values){
  const decision=decide(request);
  if(!decision.allow)throw new AuthorizationError(decision);
  const channel=channelFor(request);
  switch(channel){
    case 'clipboard': case 'share-file':return Object.freeze({channel,value:values.released});
    case 'encrypted-draft':return Object.freeze({channel,value:values.sealed});
    case 'local-ai':return Object.freeze({channel,value:values.private});
    default:throw new AuthorizationError({code:'destination',reason:'出力する経路を確認できません。'});
  }
}

export async function dispatchEgress(request,values,effects){
  const selected=selectEgress(request,values);
  const effect=effects[selected.channel];
  if(typeof effect!=='function')throw new AuthorizationError({code:'destination',reason:'出力先の実行処理がありません。'});
  return effect(selected.value);
}
