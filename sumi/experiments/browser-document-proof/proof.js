import { Noir } from '@noir-lang/noir_js';
import { Barretenberg, BackendType, UltraHonkBackend } from '@aztec-foundation/bb.js';
import { blake2s } from '@noble/hashes/blake2.js';
import { isWellFormedUnicode } from '../../src/school-policy-contract.js';

const encoder = new TextEncoder();
const hex = bytes => Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
const field = n => `0x${BigInt(n).toString(16).padStart(64, '0')}`;
const fail = message => { throw new Error(message); };
const patternBytes = terms => {
  if (!Array.isArray(terms) || terms.length < 1 || terms.length > 4) fail('禁止語は１〜４語を指定してください。');
  return terms.map(term => {
    if (typeof term !== 'string' || !isWellFormedUnicode(term)) fail('禁止語に不正な文字が含まれています。');
    const bytes = encoder.encode(term);
    if (!bytes.length || bytes.length > 16) fail('禁止語はそれぞれ１〜16バイトで指定してください。');
    return bytes;
  });
};
function publicInputs(expected) {
  if (!expected || !Number.isInteger(expected.documentLength) || expected.documentLength < 0 || expected.documentLength > 512 || typeof expected.commitment !== 'string' || !/^[a-f0-9]{64}$/.test(expected.commitment)) fail('期待条件の形式が正しくありません。');
  const terms = patternBytes(expected.forbidden);
  const padded = Array.from({length: 4}, (_, i) => { const bytes = new Uint8Array(16); if (terms[i]) bytes.set(terms[i]); return bytes; });
  const commitment = expected.commitment.match(/../g).map(x => parseInt(x, 16));
  return [expected.documentLength, ...padded.flatMap(x => [...x]), ...Array.from({length: 4}, (_, i) => terms[i]?.length || 0), terms.length, ...commitment].map(field);
}
function bytesToBase64(bytes) { let str = ''; for (let i = 0; i < bytes.length; i += 8192) str += String.fromCharCode(...bytes.subarray(i, i + 8192)); return btoa(str); }
function base64ToBytes(value) {
  if (typeof value !== 'string' || value.length > 200000 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) fail('証明データの形式が正しくありません。');
  const binary = atob(value); return Uint8Array.from(binary, x => x.charCodeAt(0));
}
export function verifyOpening(text, opening, expected) {
  publicInputs(expected);
  if (typeof text !== 'string' || !isWellFormedUnicode(text) || !opening || opening.version !== 'sumi-document-opening-v1' || !Number.isInteger(opening.documentLength) || typeof opening.salt !== 'string' || !/^[a-f0-9]{64}$/.test(opening.salt)) fail('文書または開封情報の形式が正しくありません。');
  const document = encoder.encode(text);
  if (document.length !== opening.documentLength || document.length !== expected.documentLength || document.length > 512) return false;
  const preimage = new Uint8Array(544); preimage.set(document);
  preimage.set(opening.salt.match(/../g).map(x => parseInt(x, 16)), 512);
  return hex(blake2s(preimage)) === expected.commitment;
}
export async function createEngine(circuit) {
  const noir = new Noir(circuit);
  const api = await Barretenberg.new({ backend: BackendType.Wasm, threads: 1 });
  const backend = new UltraHonkBackend(circuit.bytecode, api);
  const options = { verifierTarget: 'noir-recursive' };
  return {
    async prove(text, forbidden) {
      if (typeof text !== 'string' || !isWellFormedUnicode(text)) fail('文書に不正な文字が含まれています。');
      const document = encoder.encode(text), terms = patternBytes(forbidden);
      if (document.length > 512) fail('文書は512バイト以内にしてください。');
      const padded = new Uint8Array(512); padded.set(document);
      const salt = crypto.getRandomValues(new Uint8Array(32));
      const preimage = new Uint8Array(544); preimage.set(padded); preimage.set(salt, 512);
      const commitment = blake2s(preimage);
      const patterns = Array.from({length: 4}, (_, i) => { const p = new Uint8Array(16); if (terms[i]) p.set(terms[i]); return [...p]; });
      const statement = { documentLength: document.length, forbidden: [...forbidden], commitment: hex(commitment) };
      const input = { document_bytes: [...padded], salt: [...salt], document_length: document.length, forbidden: patterns, forbidden_lengths: Array.from({length: 4}, (_, i) => terms[i]?.length || 0), forbidden_count: terms.length, commitment: [...commitment] };
      let witness; try { ({witness} = await noir.execute(input)); } catch { fail('条件を満たす証明を作成できません。指定語が文書に含まれていないか確認してください。'); }
      const result = await backend.generateProof(witness, options);
      const expectedFields = publicInputs(statement);
      if (result.publicInputs.length !== expectedFields.length || !result.publicInputs.every((x, i) => x.toLowerCase() === expectedFields[i])) fail('証明の公開条件が入力と一致しません。');
      return { proof: { version: 'sumi-document-browser-v1', statement, proof: bytesToBase64(result.proof) }, opening: { version: 'sumi-document-opening-v1', salt: hex(salt), documentLength: document.length } };
    },
    async verify(proof, expected) {
      const expectedFields = publicInputs(expected);
      if (!proof || proof.version !== 'sumi-document-browser-v1') fail('証明の形式が正しくありません。');
      const providedFields = publicInputs(proof.statement);
      if (!expectedFields.every((x, i) => x === providedFields[i])) fail('証明の公開条件が、別途確認した期待条件と一致しません。');
      const bytes = base64ToBytes(proof.proof);
      if (bytes.length === 0 || bytes.length % 32) fail('証明データの長さが正しくありません。');
      return backend.verifyProof({ proof: bytes, publicInputs: expectedFields }, options);
    },
    destroy() { return api.destroy(); }
  };
}
