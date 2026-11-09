import schoolPolicy from './school-policy.example.json' with { type: 'json' };
const $ = id => document.getElementById(id);
const worker = new Worker('./worker.js', {type:'module'});
let job = 0, pending = null, currentProof = null, currentOpening = null, verifiedExpected = null;
const status = (id, text, error = false) => { $(id).textContent = text; $(id).classList.toggle('error', error); };
worker.onmessage = ({data}) => { if (!pending || data.id !== pending.id) return; const {resolve, reject} = pending; pending = null; if (data.error) reject(new Error(data.error)); else resolve(data.result); };
worker.onerror = () => { if (pending) { pending.reject(new Error('証明処理を開始できませんでした。ページを再読み込みしてお試しください。')); pending = null; } };
function run(action, data) { if (pending) return Promise.reject(new Error('別の処理が実行中です。')); return new Promise((resolve, reject) => { const id = ++job; pending = {id, resolve, reject}; worker.postMessage({id, action, data}); }); }
function refreshBytes() { $('byte-count').textContent = `${new TextEncoder().encode($('document').value).length} / 512 バイト`; }
function invalidate() { currentProof = currentOpening = null; $('create-result').hidden = true; $('create-empty').hidden = false; status('create-status', ''); }
for (const id of ['document', 'terms']) $(id).addEventListener('input', () => { invalidate(); refreshBytes(); });
$('terms').value = schoolPolicy.documentProof.forbidden.join('\n');
refreshBytes();
function download(name, value) { const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2) + '\n'], {type:'application/json'})); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
function busy(value) { for (const id of ['prove','verify-button','document','terms','proof-input','expected-input','opening-document','opening-input','proof-file','expected-file','opening-file']) $(id).disabled = value; $('opening-button').disabled = value || !verifiedExpected; }
$('prove').addEventListener('click', async () => {
  busy(true); invalidate(); status('create-status', '証明を作成しています。初回は公開データを取得します。');
  try { const result = await run('prove', {text:$('document').value, terms:$('terms').value.split(/\r?\n/).filter(x => x.length)}); currentProof = result.proof; currentOpening = result.opening; $('statement').value = JSON.stringify(currentProof.statement, null, 2); $('create-empty').hidden = true; $('create-result').hidden = false; status('create-status', '証明を作成しました。公開条件を確認してください。'); }
  catch (error) { status('create-status', error.message, true); } finally { busy(false); }
});
$('save-proof').addEventListener('click', () => { if (currentProof) download('sumi-proof.json', currentProof); });
$('save-statement').addEventListener('click', () => { if (currentProof) download('sumi-expected.json', currentProof.statement); });
$('save-opening').addEventListener('click', () => { if (currentOpening) download('sumi-private-opening.json', currentOpening); });
function invalidateVerification() { verifiedExpected = null; $('opening-button').disabled = true; status('verify-status', ''); status('opening-status', ''); }
for (const id of ['proof-input','expected-input']) $(id).addEventListener('input', invalidateVerification);
for (const id of ['opening-document','opening-input']) $(id).addEventListener('input', () => status('opening-status', ''));
for (const [fileId, targetId, messageId, limit] of [
  ['proof-file','proof-input','verify-status',200000],
  ['expected-file','expected-input','verify-status',10000],
  ['opening-file','opening-input','opening-status',10000],
]) $(fileId).addEventListener('change', async event => {
  const file = event.target.files[0]; event.target.value = '';
  if (!file) return;
  const target = $(targetId); target.value = ''; target.dispatchEvent(new Event('input', {bubbles:true}));
  busy(true);
  try {
    if (file.size > limit) throw new Error('ファイルが大きすぎます。正しい JSON ファイルを選んでください。');
    const text = new TextDecoder('utf-8', {fatal:true}).decode(await file.arrayBuffer());
    JSON.parse(text);
    target.value = text; target.dispatchEvent(new Event('input', {bubbles:true}));
    status(messageId, 'ファイルを読み込みました。内容を確認してください。');
  } catch (error) { status(messageId, error.message.startsWith('ファイルが') ? error.message : 'UTF-8 の正しい JSON ファイルを選んでください。', true); }
  finally { busy(false); }
});
$('verify-button').addEventListener('click', async () => {
  invalidateVerification();
  let proof, expected; try { proof = JSON.parse($('proof-input').value); expected = JSON.parse($('expected-input').value); } catch { status('verify-status', '証明と期待条件に正しい JSON を入力してください。', true); return; }
  busy(true); status('verify-status', '証明を検証しています。');
  try { const valid = await run('verify', {proof, expected}); if (!valid) throw new Error('証明を検証できませんでした。'); verifiedExpected = expected; status('verify-status', '期待条件に対する証明を検証しました。'); }
  catch (error) { status('verify-status', error.message, true); } finally { busy(false); }
});

$('opening-button').addEventListener('click', async () => {
  if (!verifiedExpected) { status('opening-status', '先に証明を検証してください。', true); return; }
  let opening; try { opening = JSON.parse($('opening-input').value); } catch { status('opening-status', '開封情報に正しい JSON を入力してください。', true); return; }
  busy(true); status('opening-status', '文書との対応を確かめています。');
  try { const valid = await run('opening', {text:$('opening-document').value, opening, expected:verifiedExpected}); if (!valid) throw new Error('文書と開封情報が検証済みの条件に一致しません。'); status('opening-status', '入力された文書は、検証済みの証明のコミットメントに一致しました。'); }
  catch (error) { status('opening-status', error.message, true); } finally { busy(false); }
});
