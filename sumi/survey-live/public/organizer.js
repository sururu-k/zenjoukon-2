const $ = (id) => document.getElementById(id);
const A = 'http://127.0.0.1:4191', B = 'http://127.0.0.1:4192';
const P = (1n << 61n) - 1n;
const get = async (url) => (await fetch(url)).json();
const post = async (url) => { const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }); const d = await r.json(); if (!r.ok) throw new Error(d.error); return d; };
let phase = 'open';
async function refresh() {
  try {
    const [a, b] = await Promise.all([get(A + '/status'), get(B + '/status')]);
    phase = a.phase;
    $('count').textContent = `回答 ${a.count}件`;
    $('publish').disabled = a.phase !== 'open' || a.count < 3 || a.count !== b.count;
  } catch { $('status').textContent = '集計担当に接続できません。'; }
}
setInterval(refresh, 800); refresh();
$('publish').addEventListener('click', async () => {
  $('publish').disabled = true;
  try {
    const [a, b] = await Promise.all([post(A + '/publish'), post(B + '/publish')]);
    if (a.count !== b.count || a.batchDigest !== b.batchDigest) throw new Error('A・Bの集計が一致しません。');
    const yes = Number((BigInt(a.share) + BigInt(b.share)) % P);
    if (yes > a.count) throw new Error('集計値が範囲外です。');
    $('yesN').textContent = `${yes}件`; $('noN').textContent = `${a.count - yes}件`;
    $('results').hidden = false;
    requestAnimationFrame(() => { $('yesBar').style.width = `${yes / a.count * 100}%`; $('noBar').style.width = `${(a.count - yes) / a.count * 100}%`; });
    $('status').textContent = `${a.count}件を集計しました。`;
  } catch (error) { $('status').textContent = error.message; }
});
$('peek').addEventListener('click', async () => {
  const [a, b] = await Promise.all([get(A + '/held'), get(B + '/held')]);
  const show = (el, h) => { el.textContent = h.held.length ? h.held.map((x) => x.share).join('\n') : '（空です）'; el.style.whiteSpace = 'pre-wrap'; };
  show($('heldA'), a); show($('heldB'), b); $('peekNote').hidden = false;
});
$('collude').addEventListener('click', async () => {
  const [a, b] = await Promise.all([get(A + '/held'), get(B + '/held')]);
  const index = new Map(b.held.map((x) => [x.batch, x.share]));
  const answers = a.held.filter((x) => index.has(x.batch)).map((x) => Number((BigInt(x.share) + BigInt(index.get(x.batch))) % P) === 1 ? '開' : '今');
  $('collusion').textContent = `両方を合わせると提出ごとの中身を復元できます：${answers.join(' ')}（回答データに名前は含めていません）`;
  $('collusion').hidden = false;
});
