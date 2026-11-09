import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {startDocumentServer} from '../document-live/server.mjs';

test('実画面から証明を作り、保存した証明と期待条件を入力して検証する',{
  skip:!process.env.SUMI_NARGO||!process.env.SUMI_BB||!process.env.SUMI_CHROMIUM,timeout:120000
},async()=>{
  const server=await startDocumentServer(0);let browser;
  try{
    browser=await chromium.launch({executablePath:process.env.SUMI_CHROMIUM,headless:true});
    const page=await browser.newPage({viewport:{width:390,height:844}});
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await page.locator('#prove').click();await page.locator('#create-result').waitFor({state:'visible',timeout:100000});
    const expected=await page.locator('#statement').inputValue();
    const pending=page.waitForEvent('download');await page.locator('#save-proof').click();
    const download=await pending,stream=await download.createReadStream(),chunks=[];
    for await(const chunk of stream)chunks.push(chunk);
    await page.locator('#proof-input').fill(Buffer.concat(chunks).toString('utf8'));
    await page.locator('#expected-input').fill(expected);
    await page.locator('#verify-button').click();
    await page.getByText('期待条件に対する証明を検証しました。').waitFor({timeout:100000});
    await page.locator('#expected-input').fill('{}');
    assert.equal(await page.locator('#verify-status').textContent(),'');
    await page.locator('#document').fill('変更した文書');
    assert.equal(await page.locator('#create-result').isHidden(),true);
  }finally{await browser?.close();server.close();}
});
