const assert = require('node:assert/strict');
const {startRegtest} = require('../regtest.cjs');
const {chromium} = require(process.env.TRANSFUR_PLAYWRIGHT_MODULE || 'playwright');
const KeyRing = require('hsd/lib/primitives/keyring');

async function visible(locator) { await locator.waitFor({state: 'visible', timeout: 15_000}); }
async function text(locator, expected) {
  await locator.page().waitForFunction(({id, expected}) => document.querySelector(id)?.textContent === expected,
    {id: await locator.evaluate(element => `#${element.id}`), expected}, {timeout: 15_000});
}

async function main() {
  const service = await startRegtest({port: 0, distDir: process.env.TRANSFUR_WEB_DIST});
  let browser;
  try {
    browser = await chromium.launch({headless: true, channel: process.env.TRANSFUR_BROWSER_CHANNEL || undefined});
    const context = await browser.newContext({viewport: {width: 320, height: 740}, hasTouch: true, isMobile: true});
    const requests = [];
    await context.route('**/*', route => {
      const request = route.request();
      const url = new URL(request.url());
      requests.push({origin: url.origin, path: url.pathname, method: request.method(), data: request.postData()});
      return url.origin === service.origin ? route.continue() : route.abort();
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(service.origin);
    await page.locator('[data-language="en"]').click();
    const password = 'regtest browser only 21';
    const id = name => page.locator(`#${name}`);
    await id('new-password').fill(password);
    await id('repeat-password').fill(password);
    await id('setup-submit').click();
    await visible(id('backup'));
    const words = await id('backup-words').locator('li').allTextContents();
    assert.equal(words.length, 12);
    await id('backup-saved').check();
    await id('backup-done').click();
    await visible(id('receive-address'));
    await text(id('chain-state'), 'Regtest · block 0');
    assert.equal(await id('backup-words').locator('li').count(), 0);
    const receive = await id('receive-address').textContent();
    assert.match(receive, /^rs1[0-9a-z]+$/);
    assert.equal(await id('receive-select').locator('option').count(), 5);
    assert.equal(await id('receive-qr').locator('path').count(), 1);
    assert.match(await id('receive-qr').getAttribute('viewBox'), /^0 0 \d+ \d+$/);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.locator('[data-language="zh-CN"]').click();
    assert.match(await page.locator('[data-i18n="balance.title"]').textContent(), /可用余额/);
    assert.match(await id('receive-select').locator('option').first().textContent(), /地址 1\/5/);
    await page.locator('[data-language="en"]').click();

    await service.fund(receive);
    await id('refresh').click();
    await text(id('available'), '2000');
    await page.waitForFunction(() => document.querySelectorAll('#activity-list .activity-row').length === 1);
    assert.equal(await id('activity-list').locator('.activity-kind').first().textContent(), 'Mining reward');
    const recipient = KeyRing.generate().getAddress().toString('regtest');
    await id('recipient').fill(KeyRing.generate().getAddress().toString('main'));
    await id('amount').fill('2.5');
    await id('prepare').click();
    await text(id('message'), 'Enter a valid regtest address (rs1…).');
    assert.equal(await id('review').isVisible(), false);
    await id('recipient').fill(recipient);
    await id('prepare').click();
    await visible(page.getByRole('dialog', {name: 'Confirm this transfer'}));
    assert.equal(await page.evaluate(() => document.activeElement.id), 'cancel');
    await page.keyboard.press('Escape');
    await id('review').waitFor({state: 'hidden'});
    assert.equal(requests.filter(request => request.method === 'POST').length, 0);
    await id('prepare').click();
    await visible(id('review'));
    await text(id('review-amount'), '2.5 HNS');
    assert.equal(await id('review-address').textContent(), recipient);
    const fee = Number((await id('review-fee').textContent()).replace(' HNS', ''));
    assert.ok(fee > 0 && fee <= 0.01);
    await id('broadcast').click();
    await visible(id('receipt'));
    await text(id('receipt-title'), 'Submitted to the node');
    const txid = await id('txid').textContent();
    assert.match(txid, /^[0-9a-f]{64}$/);
    const utxos = async () => (await (await fetch(`${service.origin}/api/coins?address=${recipient}`)).json()).coins;
    assert.ok((await utxos()).some(coin => coin.hash === txid && coin.value === 2_500_000 && coin.height === -1));
    const {height} = await service.mine();
    assert.ok((await utxos()).some(coin => coin.hash === txid && coin.value === 2_500_000 && coin.height === height));
    await id('refresh').click();
    await page.waitForFunction(() => {
      const rows = [...document.querySelectorAll('#activity-list .activity-row')];
      return rows.length === 2 && rows[0].querySelector('.activity-kind')?.textContent === 'Sent'
        && /confirmation/.test(rows[0].querySelector('.activity-state')?.textContent || '');
    });
    assert.ok((await id('activity-list').locator('.activity-kind').allTextContents()).includes('Sent'));

    await id('lock').click();
    await visible(id('unlock'));
    await page.reload();
    await visible(id('unlock'));
    await id('password').fill('not the wallet password');
    await id('unlock-submit').click();
    await text(id('message'), 'Could not unlock. Check your password.');
    await id('password').fill(password);
    await id('unlock-submit').click();
    await text(id('receive-address'), receive);
    await text(id('chain-state'), `Regtest · block ${height}`);
    assert.equal(Number(await id('available').textContent()), Number((2000 - 2.5 - fee).toFixed(6)));
    const vault = await page.evaluate(() => new Promise((resolve, reject) => {
      const req = indexedDB.open('transfur-regtest-wallet');
      req.onerror = reject;
      req.onsuccess = () => {
        const db = req.result;
        const read = db.transaction('vault').objectStore('vault').get('default');
        read.onerror = reject;
        read.onsuccess = () => { db.close(); resolve(read.result); };
      };
    }));
    assert.deepEqual(Object.keys(vault).sort(), ['encrypted', 'iv', 'network', 'salt', 'version']);
    assert.match(vault.encrypted, /^[0-9a-f]+$/);
    const epoch = await browser.newContext();
    await epoch.route('**/*', route => new URL(route.request().url()).origin === service.origin ? route.continue() : route.abort());
    const restore = await epoch.newPage();
    await restore.goto(service.origin);
    await restore.locator('#choose-restore').click();
    await restore.locator('#restore-phrase').fill(words.join(' '));
    await restore.locator('#new-password').fill(password);
    await restore.locator('#repeat-password').fill(password);
    await restore.locator('#setup-submit').click();
    await text(restore.locator('#receive-address'), receive);
    await epoch.close();
    assert.ok(requests.every(request => request.origin === service.origin));
    assert.equal(requests.filter(request => request.method === 'POST').length, 1);
    const [{data}] = requests.filter(request => request.method === 'POST');
    assert.deepEqual(Object.keys(JSON.parse(data)), ['hex']);
    assert.ok(!JSON.stringify(requests).includes(password) && !JSON.stringify(requests).includes(words.join(' ')));
    assert.deepEqual(errors, []);
    console.log(`Chromium: created and restored a local vault, received 2000 regtest HNS, and confirmed a browser-signed 2.5 HNS payment at height ${height}.`);
  } finally {
    try { await browser?.close(); } finally { await service.close(); }
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
