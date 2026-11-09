const $ = id => document.getElementById(id);
const worker = new Worker('./worker.js', {type:'module'});
let job = 0, pending = null, currentProof = null, currentOpening = null;
const status = (id, text, error = false) => { $(id).textContent = text; $(id).classList.toggle('error', error); };
worker.onmessage = ({data}) => { if (!pending || data.id !== pending.id) return; const {resolve, reject} = pending; pending = null; if (data.error) reject(new Error(data.error)); else resolve(data.result); };
worker.onerror = () => { if (pending) { pending.reject(new Error('証明処理を開始できませんでした。ページを再読み込みしてお試しください。')); pending = null; } };
function run(action, data) { if (pending) return Promise.reject(new Error('別の処理が実行中です。')); return new Promise((resolve, reject) => { const id = ++job; pending = {id, resolve, reject}; worker.postMessage({id, action, data}); }); }
function refreshBytes() { $('byte-count').textContent = `${new TextEncoder().encode($('document').value).length} / 512 バイト`; }
function invalidate() { currentProof = currentOpening = null; $('create-result').hidden = true; $('create-empty').hidden = false; status('create-status', ''); }
for (const id of ['document', 'terms']) $(id).addEventListener('input', () => { invalidate(); refreshBytes(); });
refreshBytes();
function download(name, value) { const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2) + '\n'], {type:'application/json'})); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
function busy(value) { for (const id of ['prove','verify-button','document','terms','proof-input','expected-input']) $(id).disabled = value; }
$('prove').addEventListener('click', async () => {
  busy(true); invalidate(); status('create-status', '証明を作成しています。初回は公開データを取得します。');
  try { const result = await run('prove', {text:$('document').value, terms:$('terms').value.split(/\r?\n/).filter(x => x.length)}); currentProof = result.proof; currentOpening = result.opening; $('statement').value = JSON.stringify(currentProof.statement, null, 2); $('create-empty').hidden = true; $('create-result').hidden = false; status('create-status', '証明を作成しました。公開条件を確認してください。'); }
  catch (error) { status('create-status', error.message, true); } finally { busy(false); }
});
$('save-proof').addEventListener('click', () => { if (currentProof) download('sumi-proof.json', currentProof); });
$('save-statement').addEventListener('click', () => { if (currentProof) download('sumi-expected.json', currentProof.statement); });
$('save-opening').addEventListener('click', () => { if (currentOpening) download('sumi-private-opening.json', currentOpening); });
for (const id of ['proof-input','expected-input']) $(id).addEventListener('input', () => status('verify-status', ''));
$('verify-button').addEventListener('click', async () => {
  let proof, expected; try { proof = JSON.parse($('proof-input').value); expected = JSON.parse($('expected-input').value); } catch { status('verify-status', '証明と期待条件に正しい JSON を入力してください。', true); return; }
  busy(true); status('verify-status', '証明を検証しています。');
  try { const valid = await run('verify', {proof, expected}); if (!valid) throw new Error('証明を検証できませんでした。'); status('verify-status', '期待条件に対する証明を検証しました。'); }
  catch (error) { status('verify-status', error.message, true); } finally { busy(false); }
});
