import { chromium } from 'playwright';

const OUT = '/Users/dominik/Dropbox/cc/projects/char-builder/ds-bundle/guidelines';
const PAGE = 'file:///Users/dominik/Dropbox/cc/projects/char-builder/index.html';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1680, height: 1050 }, deviceScaleFactor: 2 });
await page.goto(PAGE);
await page.waitForTimeout(800);

await page.screenshot({ path: `${OUT}/app-full.png`, fullPage: true });

const crops = [
  ['.origin', 'app-origin-bar.png'],
  ['.skillspanel', 'app-skill-grid.png'],
  ['.detail', 'app-detail-pane.png'],
  ['.summary', 'app-summary.png'],
];
for (const [sel, name] of crops) {
  const el = page.locator(sel).first();
  if (await el.count()) {
    try { await el.screenshot({ path: `${OUT}/${name}` }); console.log('crop', name); }
    catch (e) { console.log('skip', name, e.message.split('\n')[0]); }
  } else console.log('no match', sel);
}

// a skill with points + perks chosen, so the detail pane and track are populated
await page.locator('.tile').first().click().catch(() => {});
await page.waitForTimeout(300);
const det = page.locator('.detail').first();
if (await det.count()) {
  await det.screenshot({ path: `${OUT}/app-detail-selected.png` }).catch(e => console.log('skip selected', e.message.split('\n')[0]));
  console.log('crop app-detail-selected.png');
}

await browser.close();
console.log('done');
