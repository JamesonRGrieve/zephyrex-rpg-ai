// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Who uses the app in a test. The lite edition has one local person and no accounts; the SaaS
 * edition's people sign up and sign in by magic link through the pages, as a person does: the
 * test reads the link the server "emailed" from the outbox (support/outbox.ts) and opens it.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { randomBytes, randomInt } from 'node:crypto';
import { expect, type Page, type TestInfo } from '@playwright/test';
import { OUTBOX } from './outbox';

export function isHosted(testInfo: TestInfo): boolean {
  return testInfo.project.name.startsWith('saas');
}

export function freshEmail(prefix = 'person'): string {
  return `${prefix}-${randomBytes(6).toString('hex')}@e2e.test`;
}

/**
 * A client address of this page's own: the server trusts the loopback proxy's X-Forwarded-For,
 * so people never share one sign-in rate limit.
 */
async function ownAddress(page: Page): Promise<void> {
  await page.setExtraHTTPHeaders({
    'X-Forwarded-For': `10.${randomInt(0, 256)}.${randomInt(0, 256)}.${randomInt(1, 255)}`,
  });
}

/** The newest link the server sent `email`, once one has arrived. */
async function newestLink(email: string, after: number): Promise<string> {
  let link = '';
  await expect
    .poll(
      async () => {
        const sent = await readFile(path.join(OUTBOX, email.toLowerCase()), 'utf8').catch(() => '');
        const links = sent.split('\n').filter(Boolean);
        link = links.length > after ? (links.at(-1) ?? '') : '';
        return link;
      },
      { message: `a sign-in link for ${email}` },
    )
    .not.toBe('');
  return link;
}

async function linksSent(email: string): Promise<number> {
  const sent = await readFile(path.join(OUTBOX, email.toLowerCase()), 'utf8').catch(() => '');
  return sent.split('\n').filter(Boolean).length;
}

/** Signs `email` up (or in) on the hosted edition through the sign-in page and its link. */
export async function signIn(page: Page, email: string = freshEmail()): Promise<string> {
  await ownAddress(page);
  const before = await linksSent(email);
  await page.goto('/user');
  await page.getByPlaceholder('your@example.com').fill(email);
  await page.getByRole('button', { name: 'Continue with Email' }).click();
  await page.goto(await newestLink(email, before));
  // Signing in lands on the chats (zephyrex.config auth.home).
  await page.waitForURL((url) => url.pathname === '/play');
  await expect(page.getByRole('heading', { level: 1, name: 'Your chats' })).toBeVisible();
  return email;
}
