// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The visual audit: every page, on both editions, at desktop 1366 and phone 390@2x, dark and
 * light; the hosted edition signed out (its visitor pages) and signed in (the app's pages).
 *
 * Every shot is checked for what a person would notice without looking closely: no sideways
 * overflow, no page errors, nothing fetched from another host, no same-origin link that answers
 * 4xx or 5xx, exactly one h1, headings that never skip a level (one outline), a title, and
 * every image named. With VISUAL_AUDIT=<dir> it also saves each screenshot and what the page
 * reported beside it, for the review image by image:
 *
 *   VISUAL_AUDIT=<dir> playwright test e2e/audit.spec.ts --project lite --project saas
 *
 * (Modelled on Zephyreader's audit, with its review's changes: hard checks, no fixed sleeps.)
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { devices, expect, test, type Browser, type Page, type TestInfo } from '@playwright/test';
import { isHosted, signIn } from './support/people';
import { seedChat } from './support/seed';

const AUDIT_DIR = process.env.VISUAL_AUDIT ?? '';
// Real devices (their user agents, touch and mobile behaviour), at the audit's sizes.
const VIEWPORTS = {
  desktop: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 },
  phone: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 },
} as const;
const THEMES = ['dark', 'light'] as const;
const VISITOR_PAGES = ['/', '/user', '/docs/privacy'];
const APP_PAGES = ['/play', '/characters', '/lorebooks', '/personas', '/presets', '/models', '/settings'];
/** The dev server's own badge is not part of the app: leave it out of the shots. */
const HIDE_DEV_TOOLS = 'nextjs-portal { display: none !important; }';
const PER_SHOT_MS = 15_000;

interface Report {
  path: string;
  title: string;
  overflow: number;
  h1: number;
  headingSkips: string[];
  unnamedImages: number;
  pageErrors: string[];
  consoleErrors: string[];
  foreignRequests: string[];
  brokenLinks: string[];
}

/** Each same-origin link's status, fetched once per URL (so once per edition) for the run. */
const linkStatus = new Map<string, Promise<number>>();

async function brokenLinks(page: Page, origin: string): Promise<string[]> {
  const hrefs = await page.evaluate(
    (here) =>
      [...document.querySelectorAll('a[href]')]
        .map((link) => new URL((link as HTMLAnchorElement).href, here))
        .filter((url) => url.origin === new URL(here).origin)
        .map((url) => `${url.origin}${url.pathname}${url.search}`),
    origin,
  );
  const broken: string[] = [];
  for (const href of new Set(hrefs)) {
    let pending = linkStatus.get(href);
    if (pending === undefined) {
      pending = page.request.get(href, { maxRedirects: 5 }).then((response) => response.status());
      linkStatus.set(href, pending);
    }
    const status = await pending;
    if (status >= 400) broken.push(`${href} (${status})`);
  }
  return broken;
}

/** Waits for what a screenshot shows to stop changing: fonts loaded, finite animations done. */
async function settled(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle');
  await page.evaluate(async () => {
    await document.fonts.ready;
    const finite = document
      .getAnimations()
      .filter((animation) => Number.isFinite(animation.effect?.getComputedTiming().endTime ?? Infinity));
    await Promise.all(finite.map((animation) => animation.finished.catch(() => undefined)));
  });
}

async function shoot(page: Page, origin: string, target: string, name: string): Promise<Report> {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  const foreignRequests: string[] = [];
  const onPageError = (error: Error): void => void pageErrors.push(error.message);
  const onConsole = (message: { type(): string; text(): string }): void => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  };
  const onRequest = (request: { url(): string }): void => {
    const url = new URL(request.url());
    if (url.protocol.startsWith('http') && url.origin !== origin) foreignRequests.push(request.url());
  };
  page.on('pageerror', onPageError);
  page.on('console', onConsole);
  page.on('request', onRequest);
  try {
    await page.goto(target);
    await page.addStyleTag({ content: HIDE_DEV_TOOLS });
    await settled(page);
    const facts = await page.evaluate(() => ({
      title: document.title,
      overflow: document.documentElement.scrollWidth - window.innerWidth,
      h1: document.querySelectorAll('h1').length,
      // One outline: each heading at most one level below the one before it (h2 → h4 skips).
      headingSkips: [...document.querySelectorAll('h1, h2, h3, h4, h5, h6')].flatMap((heading, index, all) => {
        const level = Number(heading.tagName[1]);
        const before = index === 0 ? 0 : Number(all[index - 1].tagName[1]);
        return level > before + 1 ? [`h${before} → h${level} "${(heading.textContent ?? '').trim().slice(0, 40)}"`] : [];
      }),
      unnamedImages: [...document.querySelectorAll('img')].filter((image) => !image.hasAttribute('alt')).length,
    }));
    const report: Report = {
      path: target,
      ...facts,
      pageErrors,
      consoleErrors,
      foreignRequests,
      brokenLinks: await brokenLinks(page, origin),
    };
    if (AUDIT_DIR !== '') {
      mkdirSync(AUDIT_DIR, { recursive: true });
      await page.screenshot({ path: path.join(AUDIT_DIR, `${name}.png`), fullPage: true });
      writeFileSync(path.join(AUDIT_DIR, `${name}.json`), `${JSON.stringify(report, null, 2)}\n`);
    }
    return report;
  } finally {
    // Detached before the next shot, so one page's traffic never lands in another's report.
    page.off('pageerror', onPageError);
    page.off('console', onConsole);
    page.off('request', onRequest);
  }
}

function expectClean(report: Report): void {
  expect(report.overflow, `${report.path}: sideways overflow`).toBeLessThanOrEqual(0);
  expect(report.pageErrors, `${report.path}: page errors`).toEqual([]);
  expect(report.foreignRequests, `${report.path}: requests to another host`).toEqual([]);
  expect(report.brokenLinks, `${report.path}: broken links`).toEqual([]);
  expect(report.h1, `${report.path}: h1 count`).toBe(1);
  expect(report.headingSkips, `${report.path}: heading levels skipped`).toEqual([]);
  expect(report.title, `${report.path}: title`).not.toBe('');
  expect(report.unnamedImages, `${report.path}: images without alt`).toBe(0);
}

async function audit(browser: Browser, testInfo: TestInfo, signedIn: boolean): Promise<void> {
  // Each run makes its own desktop and phone contexts, so the phone projects add nothing.
  test.skip(testInfo.project.name.endsWith('-phone'), 'the audit sets its own viewports');
  const origin = String(testInfo.project.use.baseURL);
  const pages = signedIn ? APP_PAGES : VISITOR_PAGES;
  for (const [size, device] of Object.entries(VIEWPORTS)) {
    for (const theme of THEMES) {
      const context = await browser.newContext({ ...device, baseURL: origin });
      await context.addCookies([{ name: 'theme', value: theme, url: origin }]);
      const page = await context.newPage();
      try {
        if (signedIn && isHosted(testInfo)) await signIn(page);
        // Signed in, the pages with something in them too: a character and a chat.
        const seeded = signedIn ? await seedChat(page) : null;
        const targets = seeded === null ? pages : [...pages, `/characters/${seeded.characterId}`, `/play/${seeded.chatId}`, `/lorebooks/${seeded.lorebookId}`];
        for (const target of targets) {
          const slug = target === '/' ? 'home' : target.slice(1).replaceAll('/', '-').replace(/[0-9a-f-]{36}$/, 'record');
          const name = `${testInfo.project.name}-${signedIn ? 'in' : 'out'}-${size}-${theme}-${slug}`;
          expectClean(await shoot(page, origin, target, name));
        }
      } finally {
        await context.close();
      }
    }
  }
}

test.describe('visual audit', () => {
  test('the visitor pages', async ({ browser }, testInfo) => {
    test.skip(!isHosted(testInfo), 'the lite edition has no visitor pages');
    test.setTimeout(VISITOR_PAGES.length * 4 * PER_SHOT_MS);
    await audit(browser, testInfo, false);
  });

  test("the app's pages", async ({ browser }, testInfo) => {
    test.setTimeout((APP_PAGES.length + 3) * 4 * PER_SHOT_MS + 4 * 30_000);
    await audit(browser, testInfo, true);
  });
});
