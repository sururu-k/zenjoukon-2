import { decide, requestFor, outputClassification, POLICY_ID, DESTINATIONS } from './authorization.js';
import { canonical, hash, encryptDraft, makeSigningKey, signPackage, keyFingerprint } from './crypto.js';
import { buildSharePayload, validatePolicy, MAX_TEXT } from './privacy.js';

export class AuthorizationError extends Error {
  constructor(decision){super(decision.reason);this.name='AuthorizationError';this.code=decision.code;}
}
const immutable=value=>Object.freeze(structuredClone(value));

// アプリ内の書き出しはこのクロージャを通す。画面が持つオブジェクトの変更で、承認済み本文を差し替えられない。
export function createWorkspace(adapters) {
  let revision=0,document=null,destination='unregistered',approval=null,keys=null,keyPromise=null,fingerprint='';
  const audit=entry=>adapters.audit?.(Object.freeze(entry));
  const revoke=()=>{revision++;approval=null;};
  const matches=()=>!!document&&!!approval&&approval.revision===revision&&approval.document===document&&approval.destination===destination;
  const check=action=>decide(requestFor(action,destination,document?.label||'unknown',{fresh:!!document&&(!approval||matches()),reviewed:matches()}));
  function requireAllowed(decision){if(!decision.allow){audit({kind:'denied',code:decision.code,reason:decision.reason});throw new AuthorizationError(decision);}}
  function assertCurrent(snapshot,rev,review){
    if(snapshot!==document||revision!==rev||approval!==review||!matches())throw new AuthorizationError({code:'stale',reason:'実行前に文章・条件・保存先が変わったため、操作を取り消しました。'});
  }
  async function getKeys(){
    if(!keyPromise)keyPromise=makeSigningKey().then(async pair=>{keys=pair;fingerprint=await keyFingerprint(await crypto.subtle.exportKey('jwk',pair.publicKey));return pair;}).catch(err=>{keyPromise=null;throw err;});
    return keyPromise;
  }
  const api={
    get revision(){return revision;},
    get destination(){return destination;},
    get classification(){return document?.label||'unknown';},
    get fingerprint(){return fingerprint;},
    get reviewed(){return matches();},
    setDocument(result,policy){
      revoke();document=null;
      if(!result||typeof result.text!=='string'||!result.text.trim()||result.text.length>MAX_TEXT)return;
      const p=validatePolicy(policy),kept=result.kept;
      document=immutable({text:result.text,kept,policy:p,label:outputClassification(p,kept)});
    },
    clear(){revoke();document=null;},
    setDestination(id){if(id!==destination){revoke();destination=Object.hasOwn(DESTINATIONS,id)?id:'unregistered';}},
    revokeReview(){revoke();},
    status(action){return check(action);},
    async approve(){
      if(!document)throw new AuthorizationError({code:'unknown-label',reason:'先に共有用の文章を作成してください。'});
      const snapshot=document,rev=revision,sink=destination;
      const digest=await hash(canonical({text:snapshot.text,policy:snapshot.policy,label:snapshot.label,destination:sink,revision:rev,policyId:POLICY_ID}));
      if(snapshot!==document||rev!==revision||sink!==destination)throw new AuthorizationError({code:'stale',reason:'確認中に文章や保存先が変更されました。もう一度確認してください。'});
      approval=Object.freeze({document:snapshot,revision:rev,destination:sink,digest,at:new Date().toISOString()});
      audit({kind:'reviewed',revision:rev,destination:sink});
      return Object.freeze({revision:rev,digest,destination:sink});
    },
    async copy(){
      requireAllowed(check('copy'));
      const snapshot=document,rev=revision,review=approval;
      assertCurrent(snapshot,rev,review);
      await adapters.copy(snapshot.text);
      audit({kind:'executed',action:'copy',destination:review.destination,revision:rev});
    },
    async export(){
      requireAllowed(check('export'));
      const snapshot=document,rev=revision,review=approval;
      const payload=buildSharePayload({text:snapshot.text,kept:snapshot.kept},snapshot.policy);
      payload.authorization={policyId:POLICY_ID,documentHash:await hash(snapshot.text),reviewDigest:review.digest,revision:rev,destination:review.destination,reviewedAt:review.at};
      const envelope=await signPackage(payload,await getKeys());
      assertCurrent(snapshot,rev,review);
      await adapters.download(`sumi-${new Date().toISOString().slice(0,10)}.sumi-share.json`,envelope);
      audit({kind:'executed',action:'export',destination:review.destination,revision:rev});
      return Object.freeze({fingerprint,revision:rev});
    },
    async saveDraft(draft,passphrase,name=`sumi-draft-${new Date().toISOString().slice(0,10)}.sumi`){
      if(typeof name!=='string'||!/^sumi-[a-zA-Z0-9_-]{1,100}\.sumi$/.test(name))throw new Error('保存ファイル名が不正です。');
      const rev=revision,snapshot=structuredClone(draft);
      const encrypted=await encryptDraft(snapshot,passphrase);
      const decision=decide(requestFor('saveEncrypted','encrypted-draft','confidential',{fresh:revision===rev,encrypted:true}));
      requireAllowed(decision);
      await adapters.download(name,encrypted);
      audit({kind:'executed',action:'saveEncrypted',destination:'encrypted-draft',revision:rev});
    },
    async copyFingerprint(){
      if(!fingerprint)throw new Error('先に署名付き共有ファイルを保存してください。');
      const decision=decide(requestFor('copy','clipboard','public',{reviewed:true,fresh:true}));requireAllowed(decision);
      await adapters.copy(fingerprint);
    }
  };
  return Object.freeze(api);
}
