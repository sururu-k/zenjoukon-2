import SEAL from 'node-seal';
import { hash, encryptDraft, decryptDraft } from '../crypto.js';
import { minutes } from './numeric.js';
let runtime;
async function sealRuntime(){
  if(!runtime)runtime=SEAL(typeof window==='undefined'?{}:{locateFile:path=>new URL(`./${path}`,import.meta.url).href});
  return runtime;
}
const PARAMETERS='sumi-bfv-4096-20-tc128-v1';
function context(seal){
  const parms=new seal.EncryptionParameters(seal.SchemeType.bfv),coeff=seal.CoeffModulus.BFVDefault(4096,seal.SecLevelType.tc128),plain=seal.PlainModulus.Batching(4096,20);
  try{parms.setPolyModulusDegree(4096);parms.setCoeffModulus(coeff);parms.setPlainModulus(plain);const ctx=new seal.SEALContext(parms,true,seal.SecLevelType.tc128);if(!ctx.parametersSet())throw new Error('BFVの暗号パラメータが無効です。');return ctx;}finally{plain.delete();coeff.delete();parms.delete();}
}
function packet(p){if(p?.protocol!=='sumi-bfv-input-v1'||p.parameters!==PARAMETERS||typeof p.keyId!=='string'||!/^[a-f0-9]{64}$/.test(p.keyId)||typeof p.id!=='string'||!p.id||p.id.length>80||!Number.isInteger(p.count)||p.count<1||p.count>1000||typeof p.ciphertext!=='string'||p.ciphertext.length>500000)throw new Error('不正なBFV暗号文です。');}
function encryptValues(seal,encoder,encryptor,keyId,input){const values=minutes(input),pt=new seal.Plaintext(),ct=new seal.Ciphertext();try{encoder.encode(BigUint64Array.from([BigInt(values.length),BigInt(values.reduce((a,b)=>a+b,0))]),pt);encryptor.encrypt(pt,ct);return {protocol:'sumi-bfv-input-v1',parameters:PARAMETERS,keyId,id:crypto.randomUUID(),count:values.length,ciphertext:ct.saveToBase64(seal.ComprModeType.none)};}finally{ct.delete();pt.delete();}}

function makeOwner(seal,ctx,publicKey,secretKey,encodedPublicKey,keyId){
  let encoder,encryptor,decryptor;
  try{encoder=new seal.BatchEncoder(ctx);encryptor=new seal.Encryptor(ctx,publicKey);decryptor=new seal.Decryptor(ctx,secretKey);}
  catch(error){if(decryptor)decryptor.delete();if(encryptor)encryptor.delete();if(encoder)encoder.delete();throw error;}
  let closed=false;
  const current=()=>{if(closed)throw new Error('秘密鍵は破棄されています。');};
  return Object.freeze({
    keyId,
    exportPublicKey(){current();return Object.freeze({format:'sumi-bfv-public-key',version:1,parameters:PARAMETERS,keyId,publicKey:encodedPublicKey});},
    async exportEncrypted(passphrase){
      current();
      // The serialized secret temporarily exists in JS memory; it is never
      // returned in plaintext and cannot be reliably wiped by JavaScript.
      const encodedSecretKey=secretKey.saveToBase64(seal.ComprModeType.none);
      const envelope=await encryptDraft({format:'sumi-bfv-owner-key',version:1,parameters:PARAMETERS,keyId,publicKey:encodedPublicKey,secretKey:encodedSecretKey},passphrase);
      current();return envelope;
    },
    encrypt(input){current();return encryptValues(seal,encoder,encryptor,keyId,input);},
    decrypt(result){
      current();if(result?.protocol!=='sumi-bfv-total-v1'||result.parameters!==PARAMETERS||result.keyId!==keyId||!Number.isInteger(result.count)||result.count<1||result.count>1000||typeof result.ciphertext!=='string'||result.ciphertext.length>500000)throw new Error('この秘密鍵に対応する集計結果ではありません。');
      // Do not compute or expose secret-key-dependent noise budgets. SEAL
      // warns they can leak the key on attacker-controlled ciphertexts.
      const ct=new seal.Ciphertext(),pt=new seal.Plaintext();try{ct.loadFromBase64(ctx,result.ciphertext);decryptor.decrypt(ct,pt);const decoded=encoder.decodeBigUint64(pt),count=Number(decoded[0]),sum=Number(decoded[1]);if(count!==result.count||sum<0||sum>180*count)throw new Error('集計結果が範囲外です。');return {count,sum,mean:sum/count};}finally{ct.delete();pt.delete();}
    },
    destroy(){if(!closed){closed=true;decryptor.delete();encryptor.delete();encoder.delete();secretKey.delete();publicKey.delete();ctx.delete();}}
  });
}

export async function createFHEOwner(){
  const seal=await sealRuntime(),ctx=context(seal);let keygen,publicKey,secretKey;
  try{
    keygen=new seal.KeyGenerator(ctx);publicKey=keygen.createPublicKey();secretKey=keygen.secretKey();
    const encodedPublicKey=publicKey.saveToBase64(seal.ComprModeType.none),keyId=await hash(encodedPublicKey);
    return makeOwner(seal,ctx,publicKey,secretKey,encodedPublicKey,keyId);
  }catch(error){if(secretKey)secretKey.delete();if(publicKey)publicKey.delete();ctx.delete();throw error;}
  finally{if(keygen)keygen.delete();}
}

// Key ID must be received separately from a trusted source. Restoring a key
// does not make chosen-ciphertext decryption safe; keep this demo offline.
export async function restoreFHEOwner(inputEnvelope,passphrase,expectedKeyId){
  const envelope=structuredClone(inputEnvelope);
  if(typeof expectedKeyId!=='string'||!/^[a-f0-9]{64}$/.test(expectedKeyId))throw new Error('期待する鍵IDが不正です。');
  const payload=await decryptDraft(envelope,passphrase);
  if(!payload||typeof payload!=='object'||Array.isArray(payload)||Object.keys(payload).length!==6||!['format','version','parameters','keyId','publicKey','secretKey'].every(k=>Object.hasOwn(payload,k))||payload.format!=='sumi-bfv-owner-key'||payload.version!==1||payload.parameters!==PARAMETERS||payload.keyId!==expectedKeyId||typeof payload.publicKey!=='string'||payload.publicKey.length>500000||typeof payload.secretKey!=='string'||payload.secretKey.length>500000||await hash(payload.publicKey)!==expectedKeyId)throw new Error('暗号化されたBFV鍵または鍵IDが不正です。');
  const seal=await sealRuntime(),ctx=context(seal),publicKey=new seal.PublicKey(),secretKey=new seal.SecretKey();let owner;
  try{
    publicKey.loadFromBase64(ctx,payload.publicKey);secretKey.loadFromBase64(ctx,payload.secretKey);
    owner=makeOwner(seal,ctx,publicKey,secretKey,payload.publicKey,expectedKeyId);
    // Functional check with fresh locally generated ciphertexts only; it is
    // not a proof of key validity or of implementation security.
    for(const value of crypto.getRandomValues(new Uint8Array(4))){
      const n=value%181,p=owner.encrypt([n]),total={protocol:'sumi-bfv-total-v1',parameters:PARAMETERS,keyId:expectedKeyId,count:1,ciphertext:p.ciphertext};
      if(owner.decrypt(total).sum!==n)throw new Error('鍵の組が一致しません。');
    }
    return owner;
  }catch{
    if(owner)owner.destroy();else{secretKey.delete();publicKey.delete();ctx.delete();}
    throw new Error('暗号化されたBFV鍵を復元できません。');
  }
}

// An input contributor uses only the exported public key. The expected key
// ID must be authenticated independently; a package cannot vouch for itself.
export async function createFHEEncryptor(input,expectedKeyId){
  const pkg=structuredClone(input);
  if(!pkg||typeof pkg!=='object'||Array.isArray(pkg)||Object.keys(pkg).length!==5||!['format','version','parameters','keyId','publicKey'].every(k=>Object.hasOwn(pkg,k))||pkg.format!=='sumi-bfv-public-key'||pkg.version!==1||pkg.parameters!==PARAMETERS||typeof expectedKeyId!=='string'||!/^[a-f0-9]{64}$/.test(expectedKeyId)||pkg.keyId!==expectedKeyId||typeof pkg.publicKey!=='string'||pkg.publicKey.length>500000||await hash(pkg.publicKey)!==expectedKeyId)throw new Error('公開鍵または期待する鍵IDが不正です。');
  const seal=await sealRuntime(),ctx=context(seal),publicKey=new seal.PublicKey();
  let encoder,encryptor;
  try{publicKey.loadFromBase64(ctx,pkg.publicKey);encoder=new seal.BatchEncoder(ctx);encryptor=new seal.Encryptor(ctx,publicKey);}
  catch(error){if(encryptor)encryptor.delete();if(encoder)encoder.delete();publicKey.delete();ctx.delete();throw error;}
  let closed=false;
  return Object.freeze({keyId:expectedKeyId,encrypt(input){if(closed)throw new Error('暗号化器は破棄されています。');return encryptValues(seal,encoder,encryptor,expectedKeyId,input);},destroy(){if(!closed){closed=true;encryptor.delete();encoder.delete();publicKey.delete();ctx.delete();}}});
}

// The evaluator only accepts ciphertexts. It has neither a private key nor a
// decryptor; this same function can run on a separate, untrusted computer.
export async function evaluateCiphertexts(inputPackets){
  const inputs=structuredClone(inputPackets);
  if(!Array.isArray(inputs)||inputs.length<1||inputs.length>100)throw new Error('BFV暗号文を1〜100件指定してください。');
  inputs.forEach(packet);const first=inputs[0],ids=new Set();let count=0;
  for(const p of inputs){if(p.keyId!==first.keyId||ids.has(p.id))throw new Error('鍵の違う暗号文、または同じ暗号文の重複があります。');ids.add(p.id);count+=p.count;}
  if(count>1000)throw new Error('1回の暗号集計は合計1,000回答以内です。');
  const seal=await sealRuntime(),ctx=context(seal),evaluator=new seal.Evaluator(ctx),total=new seal.Ciphertext(),temp=new seal.Ciphertext();
  try{total.loadFromBase64(ctx,first.ciphertext);for(const p of inputs.slice(1)){temp.loadFromBase64(ctx,p.ciphertext);evaluator.addInplace(total,temp);}return {protocol:'sumi-bfv-total-v1',parameters:PARAMETERS,keyId:first.keyId,count,ciphertext:total.saveToBase64(seal.ComprModeType.none)};}finally{temp.delete();total.delete();evaluator.delete();ctx.delete();}
}
