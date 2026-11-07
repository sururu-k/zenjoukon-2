// Sumiの認可モデル。AIの返答を許可証として扱わず、宣言した経路だけを許可する。
import { validatePolicy } from './privacy.js';

export const POLICY_ID = 'sumi-egress-v1';
export const LABELS = Object.freeze(['public','internal','confidential','unknown']);
export const ACTIONS = Object.freeze(['copy','export','saveEncrypted','infer']);
export const SINKS = Object.freeze(['clipboard','share-file','encrypted-draft','local-ai','unregistered']);
export const DESTINATIONS = Object.freeze({
  clipboard: Object.freeze({label:'クリップボード',description:'貼り付け先を制御できないため、公開用の確認済み文章だけを許可します。'}),
  'share-file': Object.freeze({label:'配布用ファイル',description:'保存後の閲覧範囲を制御できないため、公開用の確認済み文章だけを許可します。'}),
  'encrypted-draft': Object.freeze({label:'この端末の暗号化下書き',description:'原文を含むデータは、パスフレーズで暗号化して保存します。'}),
  'local-ai': Object.freeze({label:'端末内のローカルAI',description:'明示的な利用操作と、ループバックの接続先を必要とします。'}),
  unregistered: Object.freeze({label:'未登録の保存・配布先',description:'保存先が確定していないため、書き出しを許可しません。'})
});
const denied=(code,reason)=>Object.freeze({allow:false,code,reason,policyId:POLICY_ID});
const allowed=reason=>Object.freeze({allow:true,code:'allowed',reason,policyId:POLICY_ID});

export function decide(r) {
  if(!r || !LABELS.includes(r.label) || !ACTIONS.includes(r.action) || !SINKS.includes(r.sink))return denied('invalid','操作または情報区分を確認できません。');
  for(const key of ['reviewed','fresh','encrypted','consented','loopback'])if(typeof r[key]!=='boolean')return denied('invalid','判定に必要な情報が揃っていません。');
  if(r.label==='unknown')return denied('unknown-label','情報区分が不明です。内容と共有条件を確認してください。');
  if(!r.fresh)return denied('stale','確認した版から内容・条件・保存先が変更されています。もう一度確認してください。');
  if((r.action==='copy'&&r.sink==='clipboard')||(r.action==='export'&&r.sink==='share-file')) {
    if(r.label!=='public')return denied('classification','この経路では公開用の加工条件が必要です。条件を厳しくするか、暗号化下書きとして保存してください。');
    if(!r.reviewed)return denied('review-required','加工後の文章全体を確認し、確認済みにしてください。');
    return allowed('公開用の加工条件・保存先・確認済みの版が一致しています。');
  }
  if(r.action==='saveEncrypted'&&r.sink==='encrypted-draft')return r.encrypted?allowed('原文を含むデータを暗号化した下書きとして保存します。'):denied('encryption-required','原文を含む下書きは、暗号化して保存してください。');
  if(r.action==='infer'&&r.sink==='local-ai')return r.consented&&r.loopback?allowed('明示的に選択した端末内のAIへの処理です。'):denied('local-consent','ローカルAIの利用操作と端末内の接続先を確認してください。');
  return denied('destination','この操作に対応する登録済みの保存・配布先を選んでください。');
}

export function outputClassification(policy, kept) {
  try {
    const p=validatePolicy(policy);
    if(!Number.isInteger(kept)||kept<0)return 'unknown';
    if(kept>0||p.location==='city'||p.age==='exact')return 'confidential';
    return ['region','hide'].includes(p.location)&&['decade','hide'].includes(p.age)&&p.school==='hide'&&p.grade==='hide'&&p.role==='hide'&&p.club==='hide'?'public':'internal';
  }catch{return 'unknown';}
}

export function requestFor(action,sink,label,flags={}) {
  return {action,sink,label,reviewed:flags.reviewed===true,fresh:flags.fresh===true,encrypted:flags.encrypted===true,consented:flags.consented===true,loopback:flags.loopback===true};
}
