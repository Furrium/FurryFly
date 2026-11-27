const assert = require('node:assert/strict');
const {startRegtest} = require('../regtest.cjs');
const {chromium} = require(process.env.TRANSFUR_PLAYWRIGHT_MODULE || 'playwright');

async function main() {
  const service = await startRegtest({port: 0, distDir: process.env.TRANSFUR_WEB_DIST});
  let browser;
  try {
    browser = await chromium.launch({headless: true, channel: process.env.TRANSFUR_BROWSER_CHANNEL || undefined});
    const context = await browser.newContext({viewport: {width: 390, height: 780}});
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin !== service.origin) return route.abort();
      if (url.pathname === '/api/status') {
        return route.fulfill({status: 200, contentType: 'application/json',
          body: JSON.stringify({network: 'main', height: 5, coinbaseMaturity: 100})});
      }
      if (url.pathname === '/api/coins') {
        return route.fulfill({status: 200, contentType: 'application/json',
          body: JSON.stringify({network: 'main', height: 5, coins: []})});
      }
      if (url.pathname === '/api/history') {
        return route.fulfill({status: 200, contentType: 'application/json',
          body: JSON.stringify({network: 'main', height: 5, transactions: []})});
      }
      return route.continue();
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(service.origin);
    await page.locator('[data-language="en"]').click();
    await page.waitForFunction(() => document.querySelector('#network-label')?.textContent === 'MAINNET');
    assert.equal(await page.locator('#notice-title').textContent(), 'Real mainnet funds.');
    const password = 'mainnet preview password 2026';
    await page.locator('#new-password').fill(password);
    await page.locator('#repeat-password').fill(password);
    await page.locator('#setup-submit').click();
    await page.locator('#backup-saved').check();
    await page.locator('#backup-done').click();
    await page.waitForFunction(() => document.querySelector('#chain-state')?.textContent === 'Mainnet · block 5');
    const address = await page.locator('#receive-address').textContent();
    assert.match(address, /^hs1[0-9a-z]+$/);
    assert.equal(await page.locator('#receive-select option').count(), 5);
    assert.equal(await page.locator('#available').textContent(), '0');
    const databases = await page.evaluate(() => indexedDB.databases().then(rows => rows.map(row => row.name)));
    assert.ok(databases.includes('transfur-mainnet-wallet'));
    assert.ok(!databases.includes('transfur-regtest-wallet'));
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({network: 'main', label: 'MAINNET', address, database: 'transfur-mainnet-wallet', height: 5}));
  } finally {
    try { await browser?.close(); } finally { await service.close(); }
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
