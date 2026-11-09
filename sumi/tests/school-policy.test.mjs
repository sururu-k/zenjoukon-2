import test from 'node:test';
import assert from 'node:assert/strict';
import { SCHOOL_POLICY, assessSchoolPolicy, generateConfigurationDraft } from '../src/school-policy.js';

test('未確認は適合とせず、デジタルと物理の目的を確認できる',()=>{
  const report=assessSchoolPolicy(SCHOOL_POLICY,{mfa:true,locked_storage:false});
  assert.equal(report.complete,false);assert.equal(report.results.find(r=>r.id==='mfa').status,'reported-met');assert.equal(report.results.find(r=>r.id==='locked_storage').status,'reported-unmet');assert.equal(report.results.find(r=>r.id==='least_privilege').status,'unknown');assert.ok(report.results.every(r=>r.purpose));
});
test('不正な入力と未知の項目を拒否し、設定案を自動適用しない',()=>{
  assert.throws(()=>assessSchoolPolicy(SCHOOL_POLICY,{mfa:'true'}));assert.throws(()=>assessSchoolPolicy(SCHOOL_POLICY,{unknown:true}));assert.throws(()=>assessSchoolPolicy({...SCHOOL_POLICY,controls:[SCHOOL_POLICY.controls[0],SCHOOL_POLICY.controls[0]]},{}));
  const draft=generateConfigurationDraft(SCHOOL_POLICY);assert.equal(draft.applied,false);assert.equal(draft.settings.length,3);assert.equal(draft.physicalChecklist.length,2);assert.ok(draft.physicalChecklist.every(item=>!item.checked));
});
