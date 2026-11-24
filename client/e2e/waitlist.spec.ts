// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Accounts are waitlist only while sign-up is closed (operator, 2026-11-23/24; SOP Waitlist and Sign-up Gate).
 * On the hosted edition the landing page leads to the waitlist, whose form posts to the app's own
 * /api/waitlist (answered here by a stand-in, so no lead reaches the ERP; the route itself is unit-tested).
 * With sign-up closed, the sign-up page leads to the waitlist while sign-in stays open. Lite has no accounts.
 */
import { expect, test } from '@playwright/test';
import { isHosted } from './support/people';

test('the landing page leads to the waitlist, and joining it says so', async ({ page }, testInfo) => {
  test.skip(!isHosted(testInfo), 'the lite edition has no accounts');
  const sent: unknown[] = [];
  await page.route('**/api/waitlist', async (route) => {
    sent.push(route.request().postDataJSON());
    await route.fulfill({ status: 202, json: { ok: true } });
  });
  await page.goto('/');
  await page.getByRole('link', { name: 'Join the waitlist' }).first().click();
  await expect(page).toHaveURL(/\/waitlist$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Accounts are waitlist only for now' })).toBeVisible();
  await page.getByRole('textbox', { name: 'Email' }).fill('zephyrex-site-test+e2e@example.com');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Join the waitlist' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'on the waitlist' })).toBeVisible();
  expect(sent).toEqual([{ email: 'zephyrex-site-test+e2e@example.com', consent: true }]);
});

test('with sign-up closed, the sign-up page leads to the waitlist, and sign-in stays open @signup-closed', async ({
  page,
}) => {
  await page.goto('/user/register');
  await expect(page).toHaveURL(/\/waitlist$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Accounts are waitlist only for now' })).toBeVisible();
  await page.goto('/user');
  await expect(page).toHaveURL(/\/user$/);
});

test('the lite edition has no waitlist: the page leads to the chats and the route is absent', async ({
  page,
  request,
}, testInfo) => {
  test.skip(isHosted(testInfo), 'the hosted edition has the waitlist');
  await page.goto('/waitlist');
  await expect(page).toHaveURL(/\/play/);
  const answer = await request.post('/api/waitlist', { data: { email: 'a@example.com', consent: true } });
  expect(answer.ok()).toBe(false);
});
