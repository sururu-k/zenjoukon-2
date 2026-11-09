import {chromium} from 'playwright';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {startDocumentServer} from '../document-live/server.mjs';

// A real browser recording of local proof creation and verification with
// fictional data. Overlay captions are added solely for the recording.
const tmp=await mkdtemp(join(tmpdir(),'sumi-document-record-'));
const target=fileURLToPath(new URL('../submission/文書の証明_実画面デモ.mp4',import.meta.url));
let browser,server;
try{
  server=await startDocumentServer(0);
  browser=await chromium.launch({headless:true,...(process.env.SUMI_CHROMIUM?{executablePath:process.env.SUMI_CHROMIUM}:{})});
  const context=await browser.newContext({viewport:{width:1280,height:800},recordVideo:{dir:tmp,size:{width:1280,height:800}},bypassCSP:true,acceptDownloads:true});
  const page=await context.newPage();
  const caption=text=>page.evaluate(value=>{
    let el=document.getElementById('recording-caption');
    if(!el){el=document.createElement('div');el.id='recording-caption';el.style.cssText='position:fixed;left:0;right:0;bottom:0;padding:14px 24px;background:#17281f;color:white;font:600 21px/1.5 sans-serif;z-index:999';document.body.appendChild(el);}
    el.textContent=value;
  },text);
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await caption('架空の文書で、指定した語を含まないことを証明します。');await page.waitForTimeout(4000);
  await page.locator('#prove').scrollIntoViewIfNeeded();await caption('文書と禁止語を入力し、証明を作成します。');
  await page.locator('#prove').click();await page.locator('#create-result').waitFor({state:'visible',timeout:120000});
  await page.locator('#statement').scrollIntoViewIfNeeded();await caption('公開条件を確認。文書の長さ・禁止語・コミットメントが公開されます。');await page.waitForTimeout(6000);
  const expected=await page.locator('#statement').inputValue(),pending=page.waitForEvent('download');
  await page.locator('#save-proof').click();const download=await pending,stream=await download.createReadStream(),chunks=[];
  for await(const chunk of stream)chunks.push(chunk);
  await page.locator('#proof-input').fill(Buffer.concat(chunks).toString('utf8'));
  await page.locator('#expected-input').fill(expected);
  await page.locator('#verify-button').scrollIntoViewIfNeeded();
  await caption('デモでは先ほどの条件を入力。実際は別の経路で期待条件を確認します。');await page.waitForTimeout(5000);
  await page.locator('#verify-button').click();await page.getByText('期待条件に対する証明を検証しました。').waitFor({timeout:120000});
  await caption('証明を検証できました。対象は指定語との完全一致に限ります。');await page.waitForTimeout(6000);
  const video=page.video();await page.close();await context.close();
  const videoPath=await video.path();
  execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-i',videoPath,'-c:v','libx264','-pix_fmt','yuv420p','-crf','23','-movflags','+faststart',target]);
  console.log(`作成: ${target}`);
}finally{await browser?.close();server?.close();await rm(tmp,{recursive:true,force:true});}
