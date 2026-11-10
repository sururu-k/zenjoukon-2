import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// Start `npm run dev` (or serve dist on port 4173) before capturing.
const output = fileURLToPath(new URL('../../docs/screenshots/', import.meta.url));
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.SUMI_CHROMIUM ? { executablePath: process.env.SUMI_CHROMIUM } : {}) });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const base = 'http://127.0.0.1:4173/';
async function open(path) {
  const response = await page.goto(base + path, { waitUntil: 'networkidle', timeout: 30000 });
  if (!response?.ok()) throw new Error(`画面を開けません: ${path} (${response?.status()})`);
}
async function shot(name) { await page.screenshot({ path: `${output}/${name}.png`, fullPage: false }); console.log(name); }
try {
  await open('index.html'); await shot('01-home');
  await open('document-proof/index.html'); await shot('02-document-proof');
  await open('writer.html'); await page.locator('#template-draft').click(); await shot('03-writer');
  await page.locator('#prepare-release').click(); await page.locator('#release-preview').scrollIntoViewIfNeeded(); await shot('04-writer-review');
  await open('gate.html'); await page.locator('#load-sample').click(); await shot('05-gate');
  await page.locator('#analyze').click(); await page.locator('#result-section').scrollIntoViewIfNeeded(); await shot('06-gate-result');
  await page.locator('[data-view="analysis"]').click(); await shot('07-gate-analysis');
  await open('proof-studio.html'); await shot('08-prove');
  await open('survey-demo.html'); await shot('09-survey-answer');
  await page.locator('#load-sample').click(); await page.locator('#show-organizer').click(); await page.locator('#publish-result').click(); await shot('10-survey-result');
  await open('assurance.html'); await shot('11-assurance');
  await open('lean/policy/index.html'); await page.waitForTimeout(2000); await shot('12-lean-policy');
  await open('lean/agent/index.html'); await page.waitForTimeout(2000); await shot('13-lean-agent');
} finally { await browser.close(); }
