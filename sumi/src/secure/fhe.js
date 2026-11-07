import SEAL from 'node-seal';
import { hash } from '../crypto.js';
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

export async function createFHEOwner(){
  const seal=await sealRuntime(),ctx=context(seal),keygen=new seal.KeyGenerator(ctx),publicKey=keygen.createPublicKey();
  const secretKey=keygen.secretKey(),encoder=new seal.BatchEncoder(ctx),encryptor=new seal.Encryptor(ctx,publicKey),decryptor=new seal.Decryptor(ctx,secretKey),keyId=await hash(publicKey.saveToBase64(seal.ComprModeType.none));keygen.delete();
  let closed=false;
  const current=()=>{if(closed)throw new Error('秘密鍵は破棄されています。');};
  return Object.freeze({
    keyId,
    encrypt(input){current();const values=minutes(input),pt=new seal.Plaintext(),ct=new seal.Ciphertext();try{encoder.encode(BigUint64Array.from([BigInt(values.length),BigInt(values.reduce((a,b)=>a+b,0))]),pt);encryptor.encrypt(pt,ct);return {protocol:'sumi-bfv-input-v1',parameters:PARAMETERS,keyId,id:crypto.randomUUID(),count:values.length,ciphertext:ct.saveToBase64(seal.ComprModeType.none)};}finally{ct.delete();pt.delete();}},
    decrypt(result){
      current();if(result?.protocol!=='sumi-bfv-total-v1'||result.parameters!==PARAMETERS||result.keyId!==keyId||!Number.isInteger(result.count)||result.count<1||result.count>1000||typeof result.ciphertext!=='string'||result.ciphertext.length>500000)throw new Error('この秘密鍵に対応する集計結果ではありません。');
      const ct=new seal.Ciphertext(),pt=new seal.Plaintext();try{ct.loadFromBase64(ctx,result.ciphertext);const budget=decryptor.invariantNoiseBudget(ct);if(budget<=0)throw new Error('暗号文のノイズ予算を使い切っています。');decryptor.decrypt(ct,pt);const decoded=encoder.decodeBigUint64(pt),count=Number(decoded[0]),sum=Number(decoded[1]);if(count!==result.count||sum<0||sum>180*count)throw new Error('集計結果が範囲外です。');return {count,sum,mean:sum/count,noiseBudgetBits:budget};}finally{ct.delete();pt.delete();}
    },
    destroy(){if(!closed){closed=true;decryptor.delete();encryptor.delete();encoder.delete();secretKey.delete();publicKey.delete();ctx.delete();}}
  });
}

// The evaluator only accepts ciphertexts. It has neither a private key nor a
// decryptor; this same function can run on a separate, untrusted computer.
export async function evaluateCiphertexts(inputs){
  if(!Array.isArray(inputs)||inputs.length<1||inputs.length>100)throw new Error('BFV暗号文を1〜100件指定してください。');
  inputs.forEach(packet);const first=inputs[0],ids=new Set();let count=0;
  for(const p of inputs){if(p.keyId!==first.keyId||ids.has(p.id))throw new Error('鍵の違う暗号文、または同じ暗号文の重複があります。');ids.add(p.id);count+=p.count;}
  if(count>1000)throw new Error('1回の暗号集計は合計1,000回答以内です。');
  const seal=await sealRuntime(),ctx=context(seal),evaluator=new seal.Evaluator(ctx),total=new seal.Ciphertext(),temp=new seal.Ciphertext();
  try{total.loadFromBase64(ctx,first.ciphertext);for(const p of inputs.slice(1)){temp.loadFromBase64(ctx,p.ciphertext);evaluator.addInplace(total,temp);}return {protocol:'sumi-bfv-total-v1',parameters:PARAMETERS,keyId:first.keyId,count,ciphertext:total.saveToBase64(seal.ComprModeType.none)};}finally{temp.delete();total.delete();evaluator.delete();ctx.delete();}
}
