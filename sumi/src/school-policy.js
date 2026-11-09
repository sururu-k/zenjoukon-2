// Self-reported observations are never treated as independently verified facts.
export const SCHOOL_POLICY=Object.freeze({
  format:'sumi-school-policy',version:1,
  controls:Object.freeze([
    Object.freeze({id:'mfa',area:'digital',title:'管理者の多要素認証',purpose:'パスワードが漏れても、管理者への不正ログインを難しくする',required:true}),
    Object.freeze({id:'least_privilege',area:'digital',title:'担当者ごとのアクセス制限',purpose:'担当外の生徒・教職員情報を閲覧できる範囲を減らす',required:true}),
    Object.freeze({id:'encrypted_backup',area:'digital',title:'暗号化したバックアップ',purpose:'紛失や障害に備え、バックアップ自体の閲覧も制限する',required:true}),
    Object.freeze({id:'locked_storage',area:'physical',title:'紙の書類と端末の施錠保管',purpose:'置き忘れや無断持ち出しを防ぐ',required:true}),
    Object.freeze({id:'screen_privacy',area:'physical',title:'画面ののぞき見防止',purpose:'本人以外への意図しない表示を減らす',required:true})
  ])
});
export function assessSchoolPolicy(policy,observations){
  if(policy?.format!=='sumi-school-policy'||policy.version!==1||!Array.isArray(policy.controls)||policy.controls.length<1||policy.controls.length>100||!observations||typeof observations!=='object'||Array.isArray(observations))throw new Error('ポリシーまたは確認結果の形式が不正です。');
  const ids=new Set();
  const results=policy.controls.map(control=>{
    if(!control||typeof control.id!=='string'||!/^[a-z][a-z0-9_]{0,63}$/.test(control.id)||ids.has(control.id)||!['digital','physical'].includes(control.area)||typeof control.title!=='string'||control.title.length>120||typeof control.purpose!=='string'||control.purpose.length>300||typeof control.required!=='boolean')throw new Error('ポリシーの項目が不正または重複しています。');
    ids.add(control.id);const value=Object.hasOwn(observations,control.id)?observations[control.id]:null;
    if(value!==null&&typeof value!=='boolean')throw new Error('確認結果はtrue・false・未確認で指定してください。');
    return {id:control.id,area:control.area,title:control.title,purpose:control.purpose,status:value===true?'reported-met':value===false?'reported-unmet':'unknown',required:control.required};
  });
  if(Object.keys(observations).some(id=>!ids.has(id)))throw new Error('ポリシーにない確認項目があります。');
  return {format:'sumi-school-assessment',version:1,results,complete:results.every(r=>!r.required||r.status==='reported-met'),evidence:'self-reported'};
}
export function generateConfigurationDraft(policy){
  assessSchoolPolicy(policy,{});
  return {format:'sumi-configuration-draft',version:1,applied:false,settings:policy.controls.filter(c=>c.area==='digital').map(c=>({control:c.id,required:c.required})),physicalChecklist:policy.controls.filter(c=>c.area==='physical').map(c=>({control:c.id,title:c.title,checked:false}))};
}
