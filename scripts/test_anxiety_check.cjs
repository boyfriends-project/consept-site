// Run against the local preview. Uses Playwright from the available test environment.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const copy = require('../content/anxiety-check.json');
const base = process.env.CHECK_URL || 'http://localhost:3010';

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    const errors = [];
    const requests = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => requests.push([request.method(), request.url()]));
    await page.goto(base + '/anxiety-check/');
    assert.equal(await page.locator('[data-question]').count(), 12);
    assert.equal(await page.locator('input:checked').count(), 0);
    for (const question of copy.questions) {
      assert((await page.locator('#question-' + question.id + ' legend').innerText()).includes(question.text));
    }
    await page.locator('#check-submit').click();
    assert.match(await page.locator('#check-error').innerText(), /Q1、Q2、Q3/);
    assert.equal(await page.evaluate(() => document.activeElement.name), 'q1');
    assert(await page.locator('#check-result').isHidden());

    for (let total = 0; total <= 36; total++) {
      let remaining = total;
      for (let number = 1; number <= 12; number++) {
        const points = Math.min(3, remaining);
        remaining -= points;
        const value = [6, 9, 11, 12].includes(number) ? 3 - points : points;
        // Native input change event with the same state the user selects.
        await page.locator('input[name="q' + number + '"][value="' + value + '"]').evaluate(input => {
          input.checked = true;
          input.dispatchEvent(new Event('change', { bubbles: true }));
        });
      }
      await page.locator('#check-submit').click();
      assert.equal(await page.locator('#check-score').innerText(), String(total));
      const expectedIndex = total <= 9 ? 0 : total <= 18 ? 1 : total <= 27 ? 2 : 3;
      assert.equal(await page.locator('#check-description h3').innerText(), copy.types[expectedIndex].name);
      for (const paragraph of copy.types[expectedIndex].paragraphs) {
        assert((await page.locator('#check-description').innerText()).includes(paragraph));
      }
      assert.equal(await page.evaluate(() => document.activeElement.id), 'result-title');
      assert.equal(await page.locator('.check-video').count(), 0);
    }
    await page.locator('input[name="q1"][value="0"]').check();
    assert(await page.locator('#check-result').isHidden());
    assert.match(await page.locator('#check-update').innerText(), /再採点/);
    await page.locator('#check-submit').click();
    assert.equal(await page.locator('#check-score').innerText(), '33');
    await page.reload();
    assert.equal(await page.locator('input:checked').count(), 0);
    assert(await page.locator('#check-result').isHidden());
    await page.locator('input[name="q1"][value="0"]').focus();
    await page.keyboard.press('Space');
    await page.keyboard.press('ArrowRight');
    assert(await page.locator('input[name="q1"][value="1"]').isChecked());
    await page.locator('#check-submit').click();
    assert.equal(await page.evaluate(() => document.activeElement.name), 'q2');
    assert(!(await page.locator('#check-error').innerText()).includes('Q1、'));
    await page.keyboard.press('Enter');
    assert.equal(page.url(), base + '/anxiety-check/');

    const output = path.resolve(__dirname, '../review/anxiety-check');
    fs.mkdirSync(output, { recursive: true });
    for (const width of [390, 1280, 320]) {
      await page.setViewportSize({ width, height: 900 });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      if (width !== 320) {
        await page.locator('h1').scrollIntoViewIfNeeded();
        await page.screenshot({ path: path.join(output, 'questions-' + width + '.png') });
      }
      for (let number = 1; number <= 12; number++) {
        await page.locator('input[name="q' + number + '"][value="0"]').check();
      }
      await page.locator('#check-submit').click();
      assert.equal(await page.locator('#check-score').innerText(), '12');
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      if (width !== 320) {
        await page.locator('#check-result').evaluate(element => element.scrollIntoView({ behavior: 'instant', block: 'start' }));
        await page.screenshot({ path: path.join(output, 'result-' + width + '.png') });
      }
    }
    assert.deepEqual(await context.cookies(), []);
    assert.deepEqual(await page.evaluate(() => [localStorage.length, sessionStorage.length]), [0, 0]);
    assert(requests.every(([method, url]) => method === 'GET' && url.startsWith(base + '/')));
    assert.deepEqual(errors, []);
    const noJs = await browser.newContext({ javaScriptEnabled: false });
    const disabled = await noJs.newPage();
    await disabled.goto(base + '/anxiety-check/');
    assert(await disabled.locator('#check-submit').isDisabled());
    assert(await disabled.locator('noscript').isVisible());
    console.log('PASS: all 37 scores, reverse items, boundaries, missing answers, editing, keyboard, 3 widths, no storage or external requests, no-JS fallback.');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
