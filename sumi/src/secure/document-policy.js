import { canonical, hash } from '../crypto.js';

const encoder=new TextEncoder();
const LIMITS=Object.freeze({documentBytes:4096,terms:8,termBytes:64});
const validString=s=>typeof s==='string'&&s.isWellFormed();

// This prepares a statement and witness for a future ZK circuit. It is a
// plaintext local check, not a proof. Never publish the returned witness.
export async function prepareDocumentPolicyStatement(text,terms){
  if(!validString(text))throw new Error('文書は正しい文字列で指定してください。');
  const bytes=encoder.encode(text);
  if(bytes.length>LIMITS.documentBytes)throw new Error('文書はUTF-8で4096バイト以内にしてください。');
  if(!Array.isArray(terms)||terms.length<1||terms.length>LIMITS.terms)throw new Error('禁止語は１〜８個で指定してください。');
  const checked=terms.map(term=>{
    if(!validString(term))throw new Error('禁止語の形式が不正です。');
    const size=encoder.encode(term).length;
    if(size<1||size>LIMITS.termBytes)throw new Error('禁止語はそれぞれUTF-8で１〜64バイトにしてください。');
    return term;
  });
  if(new Set(checked).size!==checked.length)throw new Error('禁止語の重複は指定できません。');
  if(checked.some(term=>text.includes(term)))throw new Error('禁止語に一致する箇所があります。');
  const salt=Array.from(crypto.getRandomValues(new Uint8Array(32)),n=>n.toString(16).padStart(2,'0')).join('');
  const policy={format:'sumi-document-policy-v1',matching:'exact-unicode',terms:checked};
  const commitment=await hash(canonical({domain:'sumi-document-v1',salt,'document':text}));
  const policyDigest=await hash(canonical(policy));
  return {
    statement:{format:'sumi-document-statement-v1',commitment,policyDigest},
    witness:{'document':text,salt,policy},
    note:'これはローカル検査と証明入力の準備です。ゼロ知識証明は生成していません。'
  };
}
