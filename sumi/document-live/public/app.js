const $=id=>document.getElementById(id);
let currentProof=null,currentOpening=null;
const status=(id,text,error=false)=>{const el=$(id);el.textContent=text;el.classList.toggle('error',error);};
function refreshBytes(){$('byte-count').textContent=`${new TextEncoder().encode($('document').value).length} / 512 バイト`;}
function invalidate(){currentProof=null;currentOpening=null;$('create-result').hidden=true;$('create-empty').hidden=false;status('create-status','');}
for(const id of ['document','terms'])$(id).addEventListener('input',()=>{invalidate();refreshBytes();});
refreshBytes();
async function request(path,body){
  const response=await fetch(path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
  const result=await response.json();if(!response.ok)throw new Error(result.error||'処理に失敗しました。');return result;
}
function download(filename,data){const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)+'\n'],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
$('prove').addEventListener('click',async()=>{
  const controls=['prove','document','terms'];controls.forEach(id=>$(id).disabled=true);invalidate();status('create-status','証明を作成しています。しばらくお待ちください。');
  try{const terms=$('terms').value.split(/\r?\n/).filter(x=>x.length>0),result=await request('/api/prove',{text:$('document').value,terms});
    currentProof=result.proof;currentOpening=result.opening;$('statement').value=JSON.stringify(result.proof.statement,null,2);$('create-empty').hidden=true;$('create-result').hidden=false;status('create-status','証明を作成しました。公開条件を確認してください。');
  }catch(error){status('create-status',error.message,true);}finally{controls.forEach(id=>$(id).disabled=false);}
});
$('save-proof').addEventListener('click',()=>{if(currentProof)download('sumi-proof.json',currentProof);});
$('save-opening').addEventListener('click',()=>{if(currentOpening)download('sumi-private-opening.json',currentOpening);});
for(const id of ['proof-input','expected-input'])$(id).addEventListener('input',()=>status('verify-status',''));
$('verify-button').addEventListener('click',async()=>{
  const controls=['verify-button','proof-input','expected-input'];controls.forEach(id=>$(id).disabled=true);status('verify-status','証明を検証しています。');
  try{let proof,expected;try{proof=JSON.parse($('proof-input').value);expected=JSON.parse($('expected-input').value);}catch{throw new Error('証明と期待条件に正しいJSONを入力してください。');}
    await request('/api/verify',{proof,expected});status('verify-status','期待条件に対する証明を検証しました。');
  }catch(error){status('verify-status',error.message,true);}finally{controls.forEach(id=>$(id).disabled=false);}
});
