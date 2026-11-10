// One verification session. This pure finite-state selector is compared with
// the Lean model; cryptographic operations and the JS runtime are not proved.
export const VERIFIER_STATES=Object.freeze(['ready','verifying','consumed','cancelled']);
export const VERIFIER_EVENTS=Object.freeze(['begin','success','failure','cancel']);
export function verifierTransition(state,event){
  if(!VERIFIER_STATES.includes(state)||!VERIFIER_EVENTS.includes(event))throw new Error('検証状態が不正です。');
  if(state==='ready'&&event==='begin')return Object.freeze({state:'verifying',accepted:false});
  if(state==='verifying'&&event==='success')return Object.freeze({state:'consumed',accepted:true});
  if(state==='verifying'&&event==='failure')return Object.freeze({state:'ready',accepted:false});
  if((state==='ready'||state==='verifying')&&event==='cancel')return Object.freeze({state:'cancelled',accepted:false});
  return Object.freeze({state,accepted:false});
}
