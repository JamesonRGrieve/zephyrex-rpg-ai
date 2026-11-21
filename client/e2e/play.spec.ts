// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The whole first session, on desktop and on a phone (@phone): add a model, make a character, start
 * a chat, get a streamed reply, swipe for another, and send table talk that asks for no reply.
 */
import { expect, type Page, test } from '@playwright/test';
import { act } from './support/turn';
import { MODEL_URL } from '../playwright.config';
import { isHosted, signIn } from './support/people';

// A hosted person signs up and in through the pages first; lite has one local person.
test.beforeEach(async ({ page }, testInfo) => {
  if (isHosted(testInfo)) await signIn(page);
});

async function addModel(page: Page): Promise<void> {
  await page.goto('/models');
  await page.getByRole('button', { name: 'Add a model' }).click();
  await page.getByLabel('Name').fill('E2E model');
  await page.getByLabel('Address').fill(MODEL_URL);
  await page.getByLabel('Model', { exact: true }).fill('tiny');
  await page.getByRole('switch', { name: 'Use for new chats' }).click();
  await page.getByRole('button', { name: 'Save' }).click();
  // The list row (the model's status controls name it too).
  await expect(page.getByRole('button', { name: /E2E model/ }).first()).toBeVisible();
}

test('a first chat: a model, a character, a reply, another reply, and table talk @phone', async ({ page }) => {
  await addModel(page);

  await page.goto('/characters');
  await page.getByRole('button', { name: 'New character' }).click();
  await expect(page).toHaveURL(/\/characters\/[\w-]+$/);
  const name = page.getByLabel('Name', { exact: true });
  await name.fill('Ada Vance');
  await page.getByLabel('First message').fill('*wipes her hands* Welcome aboard.');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'All changes saved' })).toBeVisible();

  await page.getByRole('button', { name: 'Chat', exact: true }).click();
  await expect(page).toHaveURL(/\/play\/[\w-]+$/);

  await act(page, 'Do', 'hands her the spanner.');
  const reply = page.getByRole('article', { name: 'Ada Vance' }).last();
  await expect(reply).toContainText('Mind the coolant.');
  await expect(reply.locator('em')).toHaveText('looks up');

  await reply.getByRole('button', { name: 'Write another reply' }).click();
  await expect(reply.getByRole('group', { name: 'Reply' })).toContainText('2/2');

  // Out of game (table talk and asking the GM, merged): between the player and the GM, apart from
  // the story.
  await act(page, 'Out of game', 'brb');
  await expect(page.getByRole('article', { name: /out of game/ }).first()).toContainText('brb');
});

test('the landing page leads to the chats, and the app installs: a manifest and an icon @phone', async ({
  page,
  request,
}) => {
  await page.goto('/');
  // Lite has no accounts, and a signed-in hosted person goes straight to their chats too.
  await expect(page).toHaveURL(/\/play$/);
  const manifest = await (await request.get('/manifest.webmanifest')).json();
  expect(manifest).toMatchObject({ display: 'standalone', start_url: '/play' });
  expect((await request.get('/icon-maskable.svg')).status()).toBe(200);
});

test('a script works the chat: a line sent, a reply asked for, the lines read back (A37)', async ({ page }) => {
  await addModel(page);
  await page.goto('/characters');
  await page.getByRole('button', { name: 'New character' }).click();
  await expect(page).toHaveURL(/\/characters\/[\w-]+$/);
  await page.getByLabel('Name', { exact: true }).fill('Ada Vance');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'All changes saved' })).toBeVisible();
  await page.getByRole('button', { name: 'Chat', exact: true }).click();
  await expect(page).toHaveURL(/\/play\/[\w-]+$/);

  // /send adds the person's line without a reply; /trigger asks for one; /messages reads them back.
  // Slash commands and scripts are typed as Out of game (A37).
  await act(page, 'Out of game', '/send I check the gauges. | /trigger | /messages names=off 0 | /echo {{pipe}}');
  await expect(page.getByRole('article', { name: 'Ada Vance' }).last()).toContainText('Mind the coolant.');
  await expect(page.getByText('I check the gauges.').first()).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'I check the gauges.' })).toBeVisible();

  // /setvar is kept with the chat: back on the page, {{getvar}} still reads it.
  const saved = page.waitForResponse(
    (answer) => answer.request().method() === 'PUT' && /\/api\/v1\/chat\/[\w-]+$/.test(new URL(answer.url()).pathname),
  );
  await act(page, 'Out of game', '/setvar key=door open');
  expect((await saved).ok()).toBe(true);
  await page.reload();
  await act(page, 'Out of game', '/getvar door | /echo The door is {{pipe}}');
  await expect(page.getByRole('status').filter({ hasText: 'The door is open' })).toBeVisible();
});
