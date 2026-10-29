import { it, expect } from 'vitest';
import { chromium } from 'playwright';
import { startDragFixture } from './fixture.mjs';

it('persists dragged and selected moves, requires cancellation reasons and preserves rejected drafts', async () => {
  const fixture = await startDragFixture();
  let browser;
  let page;
  try {
    browser = await chromium.launch({ headless: true,
      ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: 'chrome' }) });
    page = await browser.newPage({ viewport: { width: 1200, height: 1000 } });
    page.setDefaultTimeout(5000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.stack));
    await page.goto(fixture.url);
    const frame = page.frameLocator('iframe');
    const card = title => frame.locator('[data-board-card]').filter({ has: frame.getByRole('heading', { name: title, exact: true }) });
    await expect.poll(() => frame.locator('[data-board-card]').count()).toBe(2);
    await expect.poll(() => frame.locator('form[inert]').count()).toBe(0);
    await card('Draggable fixture').dragTo(frame.locator('[data-board-status="in_progress"]'));
    const status = async title => (await fixture.state()).board.tasks.find(t => t.title === title).status;
    await expect.poll(() => status('Draggable fixture')).toBe('in_progress');
    await expect.poll(() => frame.locator('[data-board-status="in_progress"] [data-board-card]').count()).toBe(1);
    await card('Draggable fixture').getByLabel('Move to', { exact: true }).selectOption('done');
    await card('Draggable fixture').getByRole('button', { name: 'Save status', exact: true }).click();
    await expect.poll(() => status('Draggable fixture')).toBe('done');
    await expect.poll(() => frame.locator('[data-board-status="done"] [data-board-card]').count()).toBe(1);
    // Empty columns remain drop targets below their headings, and reverse moves persist.
    for (const destination of ['in_progress', 'todo', 'done']) {
      await card('Draggable fixture').getByRole('heading', { name: 'Draggable fixture', exact: true })
        .dragTo(frame.locator(`[data-board-status="${destination}"]`), { targetPosition: { x: 40, y: 180 } });
      await expect.poll(() => status('Draggable fixture')).toBe(destination);
      await expect.poll(() => frame.locator(`[data-board-status="${destination}"] [data-board-card]`).filter({ has: frame.getByRole('heading', { name: 'Draggable fixture', exact: true }) }).count()).toBe(1);
    }
    // A canceled draft can be dragged back without trapping the board in edit mode.
    await card('Draggable fixture').getByRole('heading', { name: 'Draggable fixture', exact: true })
      .dragTo(frame.locator('[data-board-status="canceled"]'), { targetPosition: { x: 40, y: 180 } });
    await expect.poll(() => card('Draggable fixture').getByLabel('Cancellation reason (required to cancel)', { exact: true }).isVisible()).toBe(true);
    await card('Draggable fixture').getByRole('heading', { name: 'Draggable fixture', exact: true })
      .dragTo(frame.locator('[data-board-status="done"]'), { targetPosition: { x: 40, y: 20 } });
    await expect.poll(() => frame.locator('form[inert]').count()).toBe(0);
    expect(await status('Draggable fixture')).toBe('done');
    await card('Draggable fixture').dragTo(frame.locator('[data-board-status="canceled"]'));
    const reason = card('Draggable fixture').getByLabel('Cancellation reason (required to cancel)', { exact: true });
    await expect.poll(() => reason.isVisible()).toBe(true);
    expect(await status('Draggable fixture')).toBe('done');
    await reason.fill('No longer needed');
    await card('Draggable fixture').getByRole('button', { name: 'Save status', exact: true }).click();
    await expect.poll(() => status('Draggable fixture')).toBe('canceled');
    await expect.poll(() => frame.locator('[data-board-status="canceled"] [data-board-card]').count()).toBe(1);
    await card('Draggable fixture').getByLabel('Move to', { exact: true }).selectOption('todo');
    await card('Draggable fixture').getByRole('button', { name: 'Save status', exact: true }).click();
    await expect.poll(() => status('Draggable fixture')).toBe('todo');
    await expect.poll(() => frame.locator('[data-board-status="todo"] [data-board-card]').count()).toBe(2);
    const state = await fixture.state();
    expect(state.comments.map(c => c.data.body)).toEqual(['Canceled: No longer needed', 'Reopened from canceled. Previous reason: No longer needed']);
    expect(state.comments.every(c => c.data.authorId === 'browser-test')).toBe(true);
    expect(state.board.tasks).toHaveLength(2);
    expect(state.calls.filter(c => c.name === 'kanban__tracker_get_board').every(c => c.input.projectId === state.board.projectId)).toBe(true);
    await card('Protected fixture').getByLabel('Move to', { exact: true }).selectOption('done');
    expect(await card('Protected fixture').getByLabel('Move to', { exact: true }).inputValue()).toBe('done');
    // Exercise keyboard activation as well as the pointer saves above. It also avoids
    // Chromium's intermittent pointer targeting of the outer, scrolled test iframe.
    await card('Protected fixture').getByRole('button', { name: 'Save status', exact: true }).press('Enter');
    await expect.poll(async () => (await frame.getByRole('status', { name: 'Presentation status' }).innerText()).includes('Action rejected')).toBe(true);
    expect(await status('Protected fixture')).toBe('todo');
    expect(await card('Protected fixture').getByLabel('Move to', { exact: true }).inputValue()).toBe('done');
    await frame.getByRole('button', { name: 'Refresh authoritative state', exact: true }).click();
    await frame.getByRole('button', { name: 'Discard draft and accept current state', exact: true }).click();
    await expect.poll(async () => card('Protected fixture').getByLabel('Move to', { exact: true }).inputValue()).toBe('todo');
    expect(errors).toEqual([]);
  } catch (error) {
    console.error(JSON.stringify({ state: await fixture.state(), frames: await Promise.all((page?.frames() ?? []).map(async frame => ({ url: frame.url(), text: await frame.locator('body').innerText() }))) }, null, 2));
    throw error;
  } finally { await browser?.close(); await fixture.close(); }
});

it('fits narrow chat panels, exposes details, and scrolls while dragging in either direction', async () => {
  const fixture = await startDragFixture();
  let browser;
  try {
    browser = await chromium.launch({ headless: true,
      ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: 'chrome' }) });
    const page = await browser.newPage({ viewport: { width: 680, height: 900 } });
    page.setDefaultTimeout(5000);
    await page.goto(fixture.url);
    const frame = page.frameLocator('iframe');
    const board = frame.getByRole('region', { name: 'Status columns. Scroll horizontally to see more statuses.', exact: true });
    const card = () => frame.locator('[data-board-card]').filter({ has: frame.getByRole('heading', { name: 'Draggable fixture', exact: true }) });
    await expect.poll(() => frame.locator('form[inert]').count()).toBe(0);
    await expect.poll(() => frame.locator('[data-board-card]').count()).toBe(2);
    expect(await card().locator('details').getAttribute('open')).toBeNull();
    await card().getByText('Task details', { exact: true }).press('Enter');
    expect(await card().getByText('Saved moves are verified.', { exact: true }).isVisible()).toBe(true);
    await card().getByText('Task details', { exact: true }).press('Enter');
    const fits = () => frame.locator('html').evaluate(el => el.scrollWidth <= el.clientWidth);
    expect(await fits()).toBe(true);
    expect(await board.evaluate(el => el.scrollWidth > el.clientWidth)).toBe(true);
    expect((await card().boundingBox()).height).toBeLessThan(230);
    const dragToEdge = async side => {
      const source = await card().getByRole('heading', { name: 'Draggable fixture', exact: true }).boundingBox();
      const bounds = await board.boundingBox();
      await page.mouse.move(source.x + 25, source.y + 10);
      await page.mouse.down();
      await page.mouse.move(source.x + 35, source.y + 15, { steps: 5 });
      await page.mouse.move(side === 'right' ? bounds.x + bounds.width - 15 : bounds.x + 15, bounds.y + 20, { steps: 15 });
    };
    await dragToEdge('right');
    await expect.poll(() => board.evaluate(el => el.scrollLeft), { timeout: 3000 }).toBeGreaterThan(300);
    let target = await frame.locator('[data-board-status="done"]').boundingBox();
    await page.mouse.move(target.x + 50, target.y + 100, { steps: 5 });
    await page.mouse.up();
    const status = async () => (await fixture.state()).board.tasks.find(t => t.title === 'Draggable fixture').status;
    await expect.poll(status).toBe('done');
    await expect.poll(() => frame.locator('[data-board-status="done"] [data-board-card]').count()).toBe(1);
    // Refresh creates a new scroller. Reveal the moved card before starting a reverse drag.
    await board.evaluate(el => { el.scrollLeft = el.scrollWidth; });
    await dragToEdge('left');
    await expect.poll(() => board.evaluate(el => el.scrollLeft), { timeout: 3000 }).toBe(0);
    target = await frame.locator('[data-board-status="todo"]').boundingBox();
    await page.mouse.move(target.x + 70, target.y + 20, { steps: 5 });
    await page.mouse.up();
    await expect.poll(status).toBe('todo');
    await expect.poll(() => frame.locator('[data-board-status="todo"] [data-board-card]').count()).toBe(2);
    for (const width of [360, 680, 1200]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await fits()).toBe(true);
      if (width === 680 && process.env.KANBAN_QA_SCREENSHOT) await page.screenshot({ path: process.env.KANBAN_QA_SCREENSHOT });
    }
  } finally { await browser?.close(); await fixture.close(); }
});
