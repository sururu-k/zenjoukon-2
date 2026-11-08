import { decide, requestFor, outputClassification, POLICY_ID, DESTINATIONS, AuthorizationError } from './authorization.js';
import { dispatchEgress } from './information-flow.js';
import { canonical, hash, encryptDraft, makeSigningKey, signPackage, keyFingerprint } from './crypto.js';
import { buildSharePayload, validatePolicy, MAX_TEXT } from './privacy.js';

export { AuthorizationError } from './authorization.js';
const immutable=value=>Object.freeze(structuredClone(value));

// アプリ内の書き出しはこのクロージャを通す。画面が持つオブジェクトの変更で、承認済み本文を差し替えられない。
export function createWorkspace(adapters) {
  let revision=0,currentDocument=null,destination='unregistered',approval=null,keys=null,keyPromise=null,fingerprint='';
  const audit=entry=>adapters.audit?.(Object.freeze(entry));
  const revoke=()=>{revision++;approval=null;};
  const matches=()=>!!currentDocument&&!!approval&&approval.revision===revision&&approval.currentDocument===currentDocument&&approval.destination===destination;
  const context=action=>requestFor(action,destination,currentDocument?.label||'unknown',{fresh:!!currentDocument&&(!approval||matches()),reviewed:matches()});
  const check=action=>decide(context(action));
  function requireAllowed(decision){if(!decision.allow){audit({kind:'denied',code:decision.code,reason:decision.reason});throw new AuthorizationError(decision);}}
  function assertCurrent(snapshot,rev,review){
    if(snapshot!==currentDocument||revision!==rev||approval!==review||!matches())throw new AuthorizationError({code:'stale',reason:'実行前に文章・条件・保存先が変わったため、操作を取り消しました。'});
  }
  async function getKeys(){
    if(!keyPromise)keyPromise=makeSigningKey().then(async pair=>{keys=pair;fingerprint=await keyFingerprint(await crypto.subtle.exportKey('jwk',pair.publicKey));return pair;}).catch(err=>{keyPromise=null;throw err;});
    return keyPromise;
  }
  const api={
    get revision(){return revision;},
    get destination(){return destination;},
    get classification(){return currentDocument?.label||'unknown';},
    get fingerprint(){return fingerprint;},
    get reviewed(){return matches();},
    setDocument(result,policy){
      revoke();currentDocument=null;
      if(!result||typeof result.text!=='string'||!result.text.trim()||result.text.length>MAX_TEXT)return;
      const p=validatePolicy(policy),kept=result.kept;
      currentDocument=immutable({text:result.text,kept,policy:p,label:outputClassification(p,kept)});
    },
    clear(){revoke();currentDocument=null;},
    setDestination(id){if(id!==destination){revoke();destination=Object.hasOwn(DESTINATIONS,id)?id:'unregistered';}},
    revokeReview(){revoke();},
    status(action){return check(action);},
    async approve(){
      if(!currentDocument)throw new AuthorizationError({code:'unknown-label',reason:'先に共有用の文章を作成してください。'});
      const snapshot=currentDocument,rev=revision,sink=destination;
      const digest=await hash(canonical({text:snapshot.text,policy:snapshot.policy,label:snapshot.label,destination:sink,revision:rev,policyId:POLICY_ID}));
      if(snapshot!==currentDocument||rev!==revision||sink!==destination)throw new AuthorizationError({code:'stale',reason:'確認中に文章や保存先が変更されました。もう一度確認してください。'});
      approval=Object.freeze({currentDocument:snapshot,revision:rev,destination:sink,digest,at:new Date().toISOString()});
      audit({kind:'reviewed',revision:rev,destination:sink});
      return Object.freeze({revision:rev,digest,destination:sink});
    },
    async copy(){
      requireAllowed(check('copy'));
      const snapshot=currentDocument,rev=revision,review=approval;
      assertCurrent(snapshot,rev,review);
      await dispatchEgress(context('copy'),{released:snapshot.text},{clipboard:adapters.copy});
      audit({kind:'executed',action:'copy',destination:review.destination,revision:rev});
    },
    async export(){
      requireAllowed(check('export'));
      const snapshot=currentDocument,rev=revision,review=approval;
      const payload=buildSharePayload({text:snapshot.text,kept:snapshot.kept},snapshot.policy);
      // Keep the private edit counter and the internal review digest in memory.
      // The exported content version only depends on the approved public view.
      payload.authorization={policyId:POLICY_ID,documentHash:await hash(snapshot.text),releaseDigest:await hash(canonical({text:snapshot.text,policy:snapshot.policy,destination:review.destination,policyId:POLICY_ID})),destination:review.destination,reviewedAt:review.at};
      const envelope=await signPackage(payload,await getKeys());
      assertCurrent(snapshot,rev,review);
      await dispatchEgress(context('export'),{released:envelope},{'share-file':data=>adapters.download(`sumi-${new Date().toISOString().slice(0,10)}.sumi-share.json`,data)});
      audit({kind:'executed',action:'export',destination:review.destination,revision:rev});
      return Object.freeze({fingerprint,revision:rev});
    },
    async saveDraft(draft,passphrase,name=`sumi-draft-${new Date().toISOString().slice(0,10)}.sumi`){
      if(name!==`sumi-draft-${new Date().toISOString().slice(0,10)}.sumi`&&!['sumi-writer.sumi','sumi-zk-proof.sumi','sumi-mpc-A.sumi','sumi-mpc-B.sumi','sumi-mpc-total-A.sumi','sumi-mpc-total-B.sumi','sumi-mpc-result.sumi','sumi-bfv-input.sumi','sumi-bfv-total.sumi','sumi-dp-release.sumi'].includes(name))throw new Error('保存ファイル名が不正です。');
      const rev=revision,snapshot=structuredClone(draft);
      const encrypted=await encryptDraft(snapshot,passphrase);
      const request=requestFor('saveEncrypted','encrypted-draft','confidential',{fresh:revision===rev,encrypted:true});
      const decision=decide(request);
      requireAllowed(decision);
      await dispatchEgress(request,{sealed:encrypted},{'encrypted-draft':data=>adapters.download(name,data)});
      audit({kind:'executed',action:'saveEncrypted',destination:'encrypted-draft',revision:rev});
    },
    async copyFingerprint(){
      if(!fingerprint)throw new Error('先に署名付き共有ファイルを保存してください。');
      const request=requestFor('copy','clipboard','public',{reviewed:true,fresh:true});requireAllowed(decide(request));
      await dispatchEgress(request,{released:fingerprint},{clipboard:adapters.copy});
    }
  };
  return Object.freeze(api);
}
