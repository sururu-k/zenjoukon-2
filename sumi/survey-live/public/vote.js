import { createVerifiedSurveyBallot } from '../../src/secure/verified-survey.js';
const $ = (id) => document.getElementById(id);
const CAMPAIGN = 'sumi-survey-live';
const endpoints = { A: 'http://127.0.0.1:4191/share', B: 'http://127.0.0.1:4192/share' };
const post = async (url, body) => {
  const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(10000) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || '送信できませんでした。');
  return data;
};
let pending = null;
async function sendPending() {
  $('yes').disabled = $('no').disabled = true;
  $('retry').hidden = true;
  try {
    const { A, B } = pending;
    $('shareA').textContent = A.value; $('shareB').textContent = B.value;
    const outcomes = await Promise.allSettled([post(endpoints.A, A), post(endpoints.B, B)]);
    if (outcomes.some(outcome => outcome.status === 'rejected')) throw new Error('一部の送信結果を確認できませんでした。');
    pending = null;
    $('status').textContent = '回答しました。ありがとう！（この画面に答えは残しません）';
    setTimeout(() => { $('yes').disabled = $('no').disabled = false; $('status').textContent = ''; }, 1200);
  } catch (error) {
    $('status').textContent = error.message + ' 画面を閉じずに同じ回答を再送してください。';
    $('retry').hidden = false;
  }
}
async function vote(answer) {
  $('yes').disabled = $('no').disabled = true;
  try { pending = await createVerifiedSurveyBallot(answer, CAMPAIGN); await sendPending(); }
  catch { $('status').textContent = '回答を準備できませんでした。もう一度お試しください。'; $('yes').disabled = $('no').disabled = false; }
}
$('yes').addEventListener('click', () => vote(true));
$('no').addEventListener('click', () => vote(false));
$('retry').addEventListener('click', sendPending);
