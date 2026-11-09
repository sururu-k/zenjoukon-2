// 見えないアンケートの実画面を録画する。実際のブラウザで、実際の集計担当A・Bサーバーに通信する。
// 使い方: node scripts/record-survey-live.mjs  → submission/見えないアンケート_画面録画.mp4（要FFmpeg）
import { chromium } from 'playwright';
import { mkdir, readdir, rm, mkdtemp } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { startCollector, startWeb } from '../survey-live/server.mjs';

const out = fileURLToPath(new URL('../submission/', import.meta.url));
const tmp = (await mkdtemp('/private/tmp/sumi-survey-record-'))+'/';
const servers = [await startCollector('A', 4191), await startCollector('B', 4192), await startWeb(4190)];
const web = 'http://127.0.0.1:4190';
let browser;
const caption = (page, text) => page.evaluate((t) => {
  let el = document.getElementById('cap');
  if (!el) { el = document.createElement('div'); el.id = 'cap'; el.style.cssText = 'position:fixed;left:0;right:0;bottom:0;padding:16px 28px;background:#142019;color:#fff;font:700 24px/1.5 -apple-system,"Hiragino Sans",sans-serif;z-index:99'; document.body.appendChild(el); }
  el.textContent = t;
}, text);
try {
  browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, bypassCSP: true, recordVideo: { dir: tmp, size: { width: 1280, height: 720 } }, locale: 'ja-JP' });
  const page = await context.newPage();
  const go = async (path, text) => { await page.goto(web + path); await caption(page, text); };
  const wait = (ms) => page.waitForTimeout(ms);

  await go('/vote.html', '① 生徒会が「図書室、昼休みに開ける？」とアンケートをとる');
  await wait(3000);
  await caption(page, '② 1人目が「開けてほしい」を押す。答えは端末で2つの乱数に分かれる');
  await page.click('#yes'); await wait(3500);
  await caption(page, '③ 2人目が「今のままでよい」を押す。毎回ちがう乱数が別々の担当へ届く');
  await wait(1500); await page.click('#no'); await wait(3500);

  await go('/organizer.html', '④ 集める人の画面。2件ではまだ集計できない（個人が絞られるため）');
  await wait(3500);
  if (!(await page.locator('#publish').isDisabled())) throw new Error('2件で集計できてしまいました');

  await go('/vote.html', '⑤ 3人目が「開けてほしい」を押す');
  await wait(1500); await page.click('#yes'); await wait(3000);

  await go('/organizer.html', '⑥ 3件そろったので集計する');
  await wait(2500); await page.click('#publish'); await wait(3500);
  await caption(page, '⑦ 見えるのは合計だけ：2件 vs 1件');
  await wait(2500);
  await caption(page, '⑧ 「個別の回答を見る」を押してみる');
  await page.locator('#peek').scrollIntoViewIfNeeded(); await wait(1500);
  await page.click('#peek'); await wait(1000);
  await caption(page, '⑨ このデモでは両方のシェアを表示。片方だけなら回答を特定できません');
  await wait(5000);
  await caption(page, '⑩ 両方のシェアを合わせると復元できます。実回答には使えません');
  await page.click('#collude'); await wait(6000);
  await context.close();

  const webm = (await readdir(tmp)).find((f) => f.endsWith('.webm'));
  if (!webm) throw new Error('録画ファイルがありません');
  await mkdir(out, { recursive: true });
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', tmp + webm, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '23', '-movflags', '+faststart', out + '見えないアンケート_実画面デモ.mp4']);
  console.log('作成: submission/見えないアンケート_実画面デモ.mp4');
} finally { await browser?.close(); servers.forEach((s) => s.close()); await rm(tmp, { recursive: true, force: true }); }
