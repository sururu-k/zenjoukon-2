// Self-reported observations are never treated as independently verified facts.
import schoolPolicyData from './school-policy.example.json' with { type: 'json' };
import { validateSchoolPolicy } from './school-policy-contract.js';
export const SCHOOL_POLICY = validateSchoolPolicy(schoolPolicyData).assessment;
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
