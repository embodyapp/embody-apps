import { it, expect } from 'vitest';
import { chromium } from 'playwright';
import { startCrmFixture } from './crm-fixture.mjs';

it('fits compact CRM cards at chat widths with touch targets and vertical scrolling', async () => {
  const fixture = await startCrmFixture();
  let browser;
  try {
    browser = await chromium.launch({ headless: true, channel: 'chrome' });
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
    page.setDefaultTimeout(5000);
    await page.goto(fixture.url);
    const frame = page.frameLocator('iframe');
    await expect.poll(() => frame.getByRole('button', { name: 'Open opportunity', exact: true }).count()).toBe(5);
    expect(await frame.getByRole('button', { name: 'Save stage', exact: true }).count()).toBe(0);
    for (const width of [320, 390, 560]) {
      await page.setViewportSize({ width, height: 844 });
      expect(await frame.locator('html').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
      const targets = await frame.locator('button, select').evaluateAll(els => els.filter(el => el.getClientRects().length).map(el => ({ text: el.textContent, height: el.getBoundingClientRect().height })));
      expect(targets.filter(target => target.height < 44)).toEqual([]);
      const firstCard = frame.locator('.genui-view > section > section > section').first();
      expect((await firstCard.boundingBox()).height).toBeLessThan(420);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await frame.getByLabel('Sales stage', { exact: true }).selectOption('discovery');
    await frame.getByRole('button', { name: 'Show', exact: true }).click();
    await expect.poll(() => frame.getByRole('heading', { name: 'Discovery', exact: true }).count()).toBe(1);
    expect(await frame.locator('.genui-view').count()).toBe(1);
    await frame.locator('body').evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await page.screenshot({ path: '/private/tmp/crm-mobile-list.png' });
    await frame.getByRole('button', { name: 'Next', exact: true }).click();
    await expect.poll(() => frame.getByRole('button', { name: 'Open opportunity', exact: true }).count()).toBe(1);
    await frame.getByRole('button', { name: 'Open opportunity', exact: true }).click();
    await expect.poll(() => frame.getByRole('button', { name: 'Back to opportunities', exact: true }).count()).toBe(1);
    await frame.getByRole('button', { name: 'Back to opportunities', exact: true }).click();
    await expect.poll(() => frame.getByLabel('Sales stage', { exact: true }).inputValue()).toBe('discovery');
    expect(await frame.getByRole('button', { name: 'Open opportunity', exact: true }).count()).toBe(1);
  } finally { await browser?.close(); await fixture.close(); }
});

it('keeps detail drafts on rejection and refreshes the selected opportunity after a successful change', async () => {
  const fixture = await startCrmFixture();
  let browser;
  try {
    browser = await chromium.launch({ headless: true, channel: 'chrome' });
    const page = await browser.newPage({ viewport: { width: 320, height: 844 } });
    page.setDefaultTimeout(5000);
    await page.goto(fixture.url);
    const frame = page.frameLocator('iframe');
    await frame.getByLabel('Sales stage', { exact: true }).selectOption('evaluation');
    await frame.getByRole('button', { name: 'Show', exact: true }).click();
    await expect.poll(() => frame.getByRole('button', { name: 'Open opportunity', exact: true }).count()).toBe(1);
    await frame.getByRole('button', { name: 'Open opportunity', exact: true }).click();
    await expect.poll(() => frame.getByRole('button', { name: 'Back to opportunities', exact: true }).count()).toBe(1);
    await page.screenshot({ path: '/private/tmp/crm-mobile-detail.png' });
    await frame.getByLabel('Move to stage', { exact: true }).selectOption('lost');
    await frame.getByRole('button', { name: 'Save stage', exact: true }).click();
    await expect.poll(async () => (await frame.getByRole('status', { name: 'Presentation status' }).innerText()).includes('Action rejected')).toBe(true);
    expect(await frame.getByLabel('Move to stage', { exact: true }).inputValue()).toBe('lost');
    expect(await frame.locator('html').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    await frame.getByLabel('Loss reason (to lose)', { exact: true }).fill('Customer chose self-hosting');
    await frame.getByRole('button', { name: 'Save stage', exact: true }).click();
    await expect.poll(() => frame.getByRole('button', { name: 'Save stage', exact: true }).count()).toBe(0);
    expect(await frame.getByText('Customer chose self-hosting', { exact: true }).count()).toBe(1);
    expect(await frame.getByRole('button', { name: 'Back to opportunities', exact: true }).count()).toBe(1);
    await frame.getByRole('button', { name: 'Back to opportunities', exact: true }).click();
    await expect.poll(() => frame.getByLabel('Sales stage', { exact: true }).inputValue()).toBe('evaluation');
    expect(await frame.getByRole('button', { name: 'Open opportunity', exact: true }).count()).toBe(0);
    expect((await fixture.state()).opportunities.find(row => row.data.title === 'Verified evaluation app').data.stage).toBe('lost');
  } finally { await browser?.close(); await fixture.close(); }
});
