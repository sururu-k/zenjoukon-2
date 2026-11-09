// Validation checks the format, not the authority or safety of the policy.
const fail = () => { throw new Error('共通学校ポリシーの形式が不正です。'); };
function keys(value, expected) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail();
  const actual = Object.keys(value);
  if (actual.length !== expected.length || expected.some(k => !Object.hasOwn(value, k))) fail();
}
function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
export function validateSchoolPolicy(policy) {
  keys(policy, ['format', 'version', 'school', 'disclosurePresets', 'documentProof', 'assessment']);
  if (policy.format !== 'sumi-school-policy-example' || policy.version !== 1 || typeof policy.school !== 'string' || !policy.school.trim() || policy.school.length > 120) fail();
  keys(policy.disclosurePresets, ['teacher', 'students', 'public']);
  const choices = {location:['region','prefecture','city','hide'],age:['exact','decade','hide'],school:['type','hide'],grade:['grade','hide'],role:['general','hide'],club:['general','hide']};
  for (const preset of Object.values(policy.disclosurePresets)) {
    keys(preset, ['label', ...Object.keys(choices), 'keepCommute']);
    if (typeof preset.label !== 'string' || !preset.label.trim() || preset.label.length > 40 || typeof preset.keepCommute !== 'boolean') fail();
    for (const [name, values] of Object.entries(choices)) if (!values.includes(preset[name])) fail();
  }
  keys(policy.documentProof, ['forbidden']);
  const words = policy.documentProof.forbidden;
  if (!Array.isArray(words) || words.length < 1 || words.length > 4) fail();
  for (const word of words) {
    if (typeof word !== 'string' || !word.length || /[\r\n]/.test(word) || new TextEncoder().encode(word).length > 16) fail();
  }
  keys(policy.assessment, ['format', 'version', 'controls']);
  if (policy.assessment.format !== 'sumi-school-policy' || policy.assessment.version !== 1 || !Array.isArray(policy.assessment.controls) || policy.assessment.controls.length < 1 || policy.assessment.controls.length > 100) fail();
  const ids = new Set();
  for (const control of policy.assessment.controls) {
    keys(control, ['id', 'area', 'title', 'purpose', 'required']);
    if (typeof control.id !== 'string' || !/^[a-z][a-z0-9_]{0,63}$/.test(control.id) || ids.has(control.id) || !['digital','physical'].includes(control.area) || typeof control.title !== 'string' || !control.title.trim() || control.title.length > 120 || typeof control.purpose !== 'string' || !control.purpose.trim() || control.purpose.length > 300 || typeof control.required !== 'boolean') fail();
    ids.add(control.id);
  }
  return freeze(policy);
}
