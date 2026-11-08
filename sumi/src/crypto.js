// 暗号処理はWeb Cryptoに委ねる。教材の署名・検証の設計を参考にする。
const encoder=new TextEncoder();
const MAX_FILE=3_000_000;
const ITERATIONS=310000;
export const DRAFT_FRAME_BYTES=1_048_576;
const PADDING='fixed-1048576';
function bytes64(bytes){let s='';for(let i=0;i<bytes.length;i+=16384)s+=String.fromCharCode(...bytes.subarray(i,i+16384));return btoa(s);}
function from64(s,max=MAX_FILE){if(typeof s!=='string'||s.length>Math.ceil(max/3)*4||!/^[A-Za-z0-9+/]*={0,2}$/.test(s))throw new Error('ファイルの形式が不正です。');const bytes=Uint8Array.from(atob(s),c=>c.charCodeAt(0));if(bytes.length>max)throw new Error('ファイルが大きすぎます。');return bytes;}
export function canonical(value){
  if(value===null||typeof value==='string'||typeof value==='boolean')return JSON.stringify(value);
  if(typeof value==='number'){if(!Number.isFinite(value))throw new Error('数値が不正です。');return JSON.stringify(value);}
  if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
  if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
  throw new Error('保存できない値が含まれています。');
}
export async function hash(value){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(typeof value==='string'?value:canonical(value))))].map(b=>b.toString(16).padStart(2,'0')).join('');}
async function derive(passphrase,salt){const base=await crypto.subtle.importKey('raw',encoder.encode(passphrase),'PBKDF2',false,['deriveKey']);return crypto.subtle.deriveKey({name:'PBKDF2',hash:'SHA-256',salt,iterations:ITERATIONS},base,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);}
export async function encryptDraft(state,passphrase){
  if(typeof passphrase!=='string'||[...passphrase].length<12)throw new Error('パスフレーズは12文字以上にしてください。');
  const serialized=encoder.encode(canonical(state));if(serialized.length>DRAFT_FRAME_BYTES-4)throw new Error('暗号化する内容はUTF-8で1MiB未満にしてください。');
  // A fixed-size authenticated frame hides the JSON byte length. Zero padding
  // is inside the randomized ciphertext, and the actual length is encrypted.
  const frame=new Uint8Array(DRAFT_FRAME_BYTES);new DataView(frame.buffer).setUint32(0,serialized.length);frame.set(serialized,4);
  const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12));
  const key=await derive(passphrase,salt);
  const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:encoder.encode('sumi-draft-v2:'+PADDING)},key,frame);
  return {format:'sumi-encrypted-draft',version:2,padding:PADDING,kdf:'PBKDF2-SHA256',iterations:ITERATIONS,cipher:'AES-256-GCM',salt:bytes64(salt),iv:bytes64(iv),ciphertext:bytes64(new Uint8Array(ciphertext))};
}
export async function decryptDraft(envelope,passphrase){
  if(!envelope||envelope.format!=='sumi-encrypted-draft'||![1,2].includes(envelope.version)||envelope.version===2&&envelope.padding!==PADDING||envelope.kdf!=='PBKDF2-SHA256'||envelope.cipher!=='AES-256-GCM'||envelope.iterations!==ITERATIONS)throw new Error('対応していない下書き形式です。');
  const salt=from64(envelope.salt,16),iv=from64(envelope.iv,12),ciphertext=from64(envelope.ciphertext);
  if(salt.length!==16||iv.length!==12||ciphertext.length<16)throw new Error('ファイルの形式が不正です。');
  if(envelope.version===2&&ciphertext.length!==DRAFT_FRAME_BYTES+16)throw new Error('固定長の暗号化フレームではありません。');
  const key=await derive(passphrase,salt);
  let plaintext;try{plaintext=await crypto.subtle.decrypt({name:'AES-GCM',iv,additionalData:encoder.encode(envelope.version===1?'sumi-draft-v1':'sumi-draft-v2:'+PADDING)},key,ciphertext);}catch{throw new Error('パスフレーズが違うか、ファイルが変更されています。');}
  if(envelope.version===2){const bytes=new Uint8Array(plaintext),length=new DataView(plaintext).getUint32(0);if(length>DRAFT_FRAME_BYTES-4)throw new Error('暗号化フレームの長さが不正です。');plaintext=bytes.subarray(4,4+length);}
  try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(plaintext));}catch{throw new Error('下書きの内容を読み取れません。');}
}
export async function makeSigningKey(){return crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},false,['sign','verify']);}
export async function keyFingerprint(publicJwk){
  if(!publicJwk||publicJwk.kty!=='EC'||publicJwk.crv!=='P-256'||typeof publicJwk.x!=='string'||typeof publicJwk.y!=='string')throw new Error('公開鍵の形式が不正です。');
  return hash({crv:publicJwk.crv,kty:publicJwk.kty,x:publicJwk.x,y:publicJwk.y});
}
export async function signPackage(payload,keypair){
  if(payload?.format!=='sumi-share'||payload.version!==1||typeof payload.text!=='string')throw new Error('共有データの形式が不正です。');
  const publicKey=await crypto.subtle.exportKey('jwk',keypair.publicKey);
  const signature=await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},keypair.privateKey,encoder.encode(canonical(payload)));
  return {format:'sumi-signed-share',version:1,algorithm:'ECDSA-P256-SHA256',payload,publicKey,signature:bytes64(new Uint8Array(signature))};
}
export async function verifyPackage(envelope,expectedFingerprint=''){
  if(!envelope||envelope.format!=='sumi-signed-share'||envelope.version!==1||envelope.algorithm!=='ECDSA-P256-SHA256'||envelope.payload?.format!=='sumi-share'||envelope.payload.version!==1||typeof envelope.payload.text!=='string'||envelope.payload.text.length>50000)throw new Error('対応していない共有ファイルです。');
  const fingerprint=await keyFingerprint(envelope.publicKey);
  if(expectedFingerprint && !/^[a-f0-9]{64}$/i.test(expectedFingerprint.trim()))throw new Error('鍵指紋は64桁の英数字（0–9、a–f）を入力してください。');
  const key=await crypto.subtle.importKey('jwk',envelope.publicKey,{name:'ECDSA',namedCurve:'P-256'},false,['verify']);
  const valid=await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},key,from64(envelope.signature,128),encoder.encode(canonical(envelope.payload)));
  const matched=!!expectedFingerprint && expectedFingerprint.trim().toLowerCase()===fingerprint;
  return {valid,fingerprint,identity:!expectedFingerprint?'unconfirmed':matched?'matched':'mismatch',payload:envelope.payload};
}
