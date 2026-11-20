// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * WCAG 2.1 A and AA on every page, in both themes, on both editions: the visitor pages (hosted
 * only) and the app's own pages, signed in on the hosted edition. No rule is disabled and no
 * element is excluded: a shared primitive that fails is fixed in the framework's tokens or the
 * primitive itself (as Cule's suite does), never excused here.
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { isHosted, signIn } from './support/people';
import { seedChat } from './support/seed';

const STANDARDS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
const VISITOR_PAGES = ['/', '/user', '/docs/privacy'];
const APP_PAGES = ['/play', '/campaigns', '/scenarios', '/characters', '/lorebooks', '/data-bank', '/personas', '/presets', '/models', '/regex', '/quick-replies', '/settings'];
/** One load, network idle and an axe pass per page; a flat limit runs out on a loaded runner. */
const PER_PAGE_MS = 20_000;
const SIGN_IN_MS = 30_000;

async function violations(page: Page, theme: 'light' | 'dark'): Promise<string[]> {
  // The theme under test is the one on the page, so a test can't pass in the other theme.
  const dark = await page.evaluate(() => document.documentElement.classList.contains('dark'));
  expect(dark ? 'dark' : 'light').toBe(theme);
  const results = await new AxeBuilder({ page }).withTags(STANDARDS).analyze();
  return results.violations.map(
    // Each failing element by its markup as well as its selector: a generated id names nothing.
    (violation) =>
      `${violation.id}: ${violation.help} (${violation.nodes.map((node) => `${node.target.join(' ')} ${node.html}`).join(', ')})`,
  );
}

for (const theme of ['light', 'dark'] as const) {
  test(`the visitor pages meet WCAG 2.1 AA in ${theme}`, async ({ page, context }, testInfo) => {
    test.skip(!isHosted(testInfo), 'the lite edition has no visitor pages');
    test.setTimeout(VISITOR_PAGES.length * PER_PAGE_MS);
    await context.addCookies([{ name: 'theme', value: theme, url: String(testInfo.project.use.baseURL) }]);
    for (const path of VISITOR_PAGES) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      expect(await violations(page, theme), path).toEqual([]);
    }
  });

  test(`the app's pages meet WCAG 2.1 AA in ${theme}`, async ({ page, context }, testInfo) => {
    test.setTimeout(SIGN_IN_MS + (APP_PAGES.length + 4) * PER_PAGE_MS);
    await context.addCookies([{ name: 'theme', value: theme, url: String(testInfo.project.use.baseURL) }]);
    if (isHosted(testInfo)) await signIn(page);
    // The pages with something in them too: a character and a chat.
    const { characterId, chatId, lorebookId } = await seedChat(page);
    for (const path of [...APP_PAGES, `/characters/${characterId}`, `/play/${chatId}`, `/lorebooks/${lorebookId}`]) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      expect(await violations(page, theme), path).toEqual([]);
    }
  });
}
