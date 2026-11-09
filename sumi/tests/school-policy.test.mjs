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

import schoolPolicy from '../src/school-policy.example.json' with { type: 'json' };
import { PRESETS, validatePolicy } from '../src/privacy.js';

test('同じ学校向け設定から共有プリセットと文書証明の初期禁止語を得る', () => {
  assert.equal(schoolPolicy.format, 'sumi-school-policy-example');
  assert.equal(schoolPolicy.version, 1);
  assert.deepEqual(PRESETS, schoolPolicy.disclosurePresets);
  assert.deepEqual(SCHOOL_POLICY, schoolPolicy.assessment);
  for (const preset of Object.values(PRESETS)) assert.deepEqual(validatePolicy(preset), preset);
  assert.ok(schoolPolicy.documentProof.forbidden.length >= 1 && schoolPolicy.documentProof.forbidden.length <= 4);
  for (const word of schoolPolicy.documentProof.forbidden) assert.ok(typeof word === 'string' && Buffer.byteLength(word) > 0 && Buffer.byteLength(word) <= 16);
});

import { validateSchoolPolicy } from '../src/school-policy-contract.js';

test('共通設定の不正な版・未知項目・型や文字数の異常を拒否する', () => {
  const clone = () => structuredClone(schoolPolicy);
  const mutations = [
    p => { p.version = 2; },
    p => { delete p.documentProof; },
    p => { p.unexpected = true; },
    p => { p.disclosurePresets.public.location = 'raw'; },
    p => { p.disclosurePresets.public.keepCommute = 'true'; },
    p => { p.documentProof.forbidden = []; },
    p => { p.documentProof.forbidden = ['長'.repeat(6)]; },
    p => { p.documentProof.forbidden = ['山\n田']; },
    p => { p.documentProof.forbidden = ['\ud800']; },
    p => { p.documentProof.forbidden = ['\udc00']; },
    p => { p.assessment.controls.push({...p.assessment.controls[0]}); },
    p => { p.assessment.controls[0].required = 'true'; },
  ];
  for (const mutate of mutations) { const candidate = clone(); mutate(candidate); assert.throws(() => validateSchoolPolicy(candidate), /形式が不正/); }
  const valid = validateSchoolPolicy(clone());
  assert.ok(Object.isFrozen(valid));
  assert.ok(Object.isFrozen(valid.documentProof.forbidden));
  assert.ok(Object.isFrozen(valid.disclosurePresets.public));
  const emoji=clone(); emoji.documentProof.forbidden=['📚'];
  assert.deepEqual(validateSchoolPolicy(emoji).documentProof.forbidden,['📚']);
});
