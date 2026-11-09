import { splitContribution } from '/src/secure/mpc.js';
const $ = (id) => document.getElementById(id);
const CAMPAIGN = 'sumi-survey-live';
const endpoints = { A: 'http://127.0.0.1:4191/share', B: 'http://127.0.0.1:4192/share' };
const post = async (url, body) => {
  const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || '送信できませんでした。');
  return data;
};
async function vote(answer) {
  $('yes').disabled = $('no').disabled = true;
  try {
    const { A, B } = splitContribution([answer ? 1 : 0], CAMPAIGN);
    $('shareA').textContent = A.share; $('shareB').textContent = B.share;
    await Promise.all([post(endpoints.A, A), post(endpoints.B, B)]);
    $('status').textContent = '回答しました。ありがとう！（この画面に答えは残しません）';
    setTimeout(() => { $('yes').disabled = $('no').disabled = false; $('status').textContent = ''; }, 1200);
  } catch (error) {
    $('status').textContent = '送れませんでした：' + error.message;
    $('yes').disabled = $('no').disabled = false;
  }
}
$('yes').addEventListener('click', () => vote(true));
$('no').addEventListener('click', () => vote(false));
