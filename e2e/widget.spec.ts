import AxeBuilder from '@axe-core/playwright';
import { type Page, expect, test } from '@playwright/test';

// The widget lives in a shadow root; Playwright's CSS engine pierces open shadow roots.
const launcher = (page: Page) => page.locator('ask-static .launcher');
const panel = (page: Page) => page.locator('ask-static .panel');
const input = (page: Page) => page.locator('ask-static input');

async function openChat(page: Page) {
  await page.goto('/');
  await launcher(page).click();
  await expect(panel(page)).toBeVisible();
}

async function ask(page: Page, text: string) {
  await input(page).fill(text);
  await input(page).press('Enter');
}

test.beforeEach(async ({ page }) => {
  // Start every test with an empty session, but only once: init scripts also run on later navigations.
  await page.addInitScript(() => {
    if (sessionStorage.getItem('__pw')) return;
    sessionStorage.clear();
    sessionStorage.setItem('__pw', '1');
  });
});

test('open, ask, clarify, answer with a source link', async ({ page }) => {
  await openChat(page);
  await expect(input(page)).toBeFocused();
  await ask(page, 'How do I install it?');
  await expect(page.locator('ask-static .chip', { hasText: 'Astro' })).toBeVisible();
  await page.locator('ask-static .chip', { hasText: 'Astro' }).click();
  const source = page.locator('ask-static .src').first();
  await expect(source).toBeVisible();
  await expect(source).toHaveAttribute('href', /\/docs\/install\/astro\//);
});

test('unknown question falls back to site search results', async ({ page }) => {
  await openChat(page);
  await ask(page, 'performance budget');
  await expect(page.locator('ask-static .msg').filter({ hasText: /pages might help|Searching the site/ }).first()).toBeVisible({ timeout: 20_000 });
});

test('back and other topic', async ({ page }) => {
  await openChat(page);
  await ask(page, 'How do I install it?');
  await page.locator('ask-static .chip', { hasText: 'Astro' }).click();
  await page.locator('ask-static .tool', { hasText: 'Back' }).click();
  await expect(page.locator('ask-static .chip', { hasText: 'WordPress' })).toBeVisible();
});

test('keyboard only: open, ask, close with Escape returns focus to the launcher', async ({ page }) => {
  await page.goto('/');
  await launcher(page).focus();
  await page.keyboard.press('Enter');
  await expect(panel(page)).toBeVisible();
  await expect(input(page)).toBeFocused();
  await page.keyboard.type('Does it use AI?');
  await page.keyboard.press('Enter');
  await expect(page.locator('ask-static .msg').filter({ hasText: /No\. Answers are selected/ })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(panel(page)).toBeHidden();
  await expect(launcher(page)).toBeFocused();
});

test('replies are announced through a status region, the log itself is not live', async ({ page }) => {
  await openChat(page);
  await expect(page.locator('ask-static .log')).toHaveAttribute('aria-live', 'off');
  await ask(page, 'Does it use AI?');
  await expect(page.locator('ask-static [role="status"][aria-live="polite"]')).toContainText('No. Answers are selected', { timeout: 5000 });
});

test('screen-reader author prefixes are present', async ({ page }) => {
  await openChat(page);
  await ask(page, 'Does it use AI?');
  await expect(page.locator('ask-static .row.user .sr')).toHaveText('You said: ');
  await expect(page.locator('ask-static .row.bot .sr').last()).toHaveText('Assistant: ');
});

for (const theme of ['light', 'dark'] as const) {
  test(`no axe violations with the chat open (${theme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme });
    await openChat(page);
    await ask(page, 'How do I install it?');
    await expect(page.locator('ask-static .chip', { hasText: 'Astro' })).toBeVisible();
    const results = await new AxeBuilder({ page }).include('ask-static').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
  });
}

test('touch targets: main controls 44px, chips and links at least 32px (WCAG 2.2 AA asks for 24px)', async ({ page }) => {
  await openChat(page);
  await ask(page, 'How do I install it?');
  await expect(page.locator('ask-static .chip').first()).toBeVisible();
  const heightOf = (sel: string, min: number) =>
    page.locator(sel).evaluateAll((els, m) => els.filter((e) => e.getBoundingClientRect().height > 0 && e.getBoundingClientRect().height < m).map((e) => `${e.tagName}.${e.className}:${Math.round(e.getBoundingClientRect().height)}`), min);
  expect(await heightOf('ask-static .send, ask-static .close, ask-static input, ask-static .launcher', 43.5)).toEqual([]);
  expect(await heightOf('ask-static .chip, ask-static .tool, ask-static a.src', 31.5)).toEqual([]);
});

test('320px wide: no horizontal scroll and the panel fits the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await openChat(page);
  await ask(page, 'How do I install it?');
  const box = await panel(page).boundingBox();
  expect(box && box.x >= 0 && box.x + box.width <= 320).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('reduced motion: replies appear without the typing delay', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openChat(page);
  const start = Date.now();
  await ask(page, 'Does it use AI?');
  await expect(page.locator('ask-static .msg').filter({ hasText: /No\. Answers are selected/ })).toBeVisible();
  expect(Date.now() - start).toBeLessThan(700);
});

test('no content is injected as HTML', async ({ page }) => {
  await openChat(page);
  await ask(page, '<img src=x onerror=window.__xss=1>');
  await expect(page.locator('ask-static .row.user')).toContainText('<img src=x');
  expect(await page.evaluate(() => (window as any).__xss)).toBeUndefined();
});

test('clear chat removes the conversation and the saved session', async ({ page }) => {
  await openChat(page);
  await expect(page.locator('ask-static [aria-label="Clear chat"]')).toBeHidden();
  await ask(page, 'Does it use AI?');
  await expect(page.locator('ask-static .row.user')).toHaveCount(1);
  await page.locator('ask-static [aria-label="Clear chat"]').click();
  await expect(page.locator('ask-static .row.user')).toHaveCount(0);
  await expect(input(page)).toBeFocused();
  await page.reload();
  await launcher(page).click();
  await expect(page.locator('ask-static .row.user')).toHaveCount(0);
});

test('the open chat survives a page navigation', async ({ page }) => {
  await openChat(page);
  await ask(page, 'Does it use AI?');
  await expect(page.locator('ask-static .row.user')).toHaveCount(1);
  await page.goto('/pricing/');
  await expect(panel(page)).toBeVisible();
  await expect(page.locator('ask-static .row.user')).toHaveCount(1);
});
