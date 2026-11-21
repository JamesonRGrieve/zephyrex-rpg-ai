// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * No page is wider than a phone (the operator, 2026-11-21: "I have to horizontal scroll
 * everywhere"). Seeds content shaped like the operator's imports (long names and titles, long
 * narration, a markdown table, an unbroken string) and, on every page at phone width, lists each
 * element whose box runs past the viewport. The visual audit's overflow measure read only the
 * largest scroller and missed this.
 */
import { expect, type Page, test } from '@playwright/test';
import { isHosted, signIn } from './support/people';
import { post } from './support/seed';

const LONG = 'Brother-Missionary Osk Halleran of the Penitent Lantern, Sector Calixis, Ordo Hereticus';
const UNBROKEN = 'https://example.invalid/' + 'a'.repeat(160);
const TABLE =
  '| # | Category | Score | Δ |\n|---|---|---|---|\n| 1 | Operational Security | **52** | — |\n| 2 | Forethought / Planning | **58** | — |';
const NARRATION = `The Errant Vector shudders out of the warp. ${'The hull groans, the alarms trip in unison, and purple papercuts open along the corridor. '.repeat(6)}\n\n${TABLE}\n\n${UNBROKEN}`;

/** Every element that sticks out past the right edge, by its tag, classes and text. */
async function offenders(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    const out: string[] = [];
    for (const element of document.querySelectorAll<HTMLElement>('body *')) {
      const box = element.getBoundingClientRect();
      if (box.width === 0 || box.right <= width + 1) continue;
      // Inside a scroller that clips it, it scrolls there, not the page.
      let clipped = false;
      for (let up = element.parentElement; up && up !== document.body; up = up.parentElement) {
        const style = getComputedStyle(up);
        if (/(auto|scroll|hidden|clip)/.test(style.overflowX) && up.getBoundingClientRect().right <= width + 1) {
          clipped = true;
          break;
        }
      }
      if (clipped) continue;
      const name = `${element.tagName.toLowerCase()}.${String(element.className).split(' ').slice(0, 4).join('.')}`;
      out.push(
        `${name} right=${Math.round(box.right)} w=${Math.round(box.width)} "${(element.textContent ?? '').trim().slice(0, 40)}"`,
      );
    }
    return out.slice(0, 12);
  });
}

test('no page is wider than a phone @phone', async ({ page }, testInfo) => {
  if (isHosted(testInfo)) await signIn(page);
  await page.goto('/play');
  const character = await post(page, 'character', {
    name: LONG,
    description: NARRATION,
    tags: ['PC', 'Voidship Escapade'],
    folder: 'Voidship Escapade',
  });
  const npc = await post(page, 'character', {
    name: 'Confessor Ruhl',
    description: NARRATION,
    tags: ['NPC'],
    folder: 'Voidship Escapade',
  });
  const frame = await post(page, 'campaign_frame', {
    name: `Voidship Escapade: ${LONG}`,
    premise: NARRATION,
    truths: [UNBROKEN],
  });
  await post(page, 'scenario', { name: `Run Sheet: ${LONG}`, campaign_id: frame.id, situation: NARRATION });
  const book = await post(page, 'lorebook', { name: `${LONG}: the world`, description: NARRATION });
  await post(page, 'lorebook_entry', {
    lorebook_id: book.id,
    comment: LONG,
    keys: [LONG, UNBROKEN.slice(0, 60)],
    content: NARRATION,
  });
  const chat = await post(page, 'chat', {
    title: `Voidship Escapade: Run 1 — ${LONG}`,
    mode: 'group',
    character_ids: [character.id, npc.id],
    seat: 'gm',
    campaign_id: frame.id,
    folder: 'Voidship Escapade',
  });
  await post(page, 'campaign_play', { chat_id: chat.id, playing_id: null });
  const first = await post(page, 'chat_message', {
    chat_id: chat.id,
    parent_id: null,
    role: 'narrator',
    channel: 'ic',
    swipes: [NARRATION],
  });
  await post(page, 'chat_message', {
    chat_id: chat.id,
    parent_id: first.id,
    role: 'character',
    channel: 'ic',
    speaker_character_id: character.id,
    swipes: [NARRATION],
  });
  await post(page, 'chat_session', { chat_id: chat.id, number: 1, start_message_id: first.id });

  const pages = [
    '/play',
    '/sandbox',
    '/campaigns',
    `/campaigns/${frame.id}`,
    '/scenarios',
    `/play/${chat.id}`,
    '/characters',
    `/characters/${character.id}`,
    '/lorebooks',
    `/lorebooks/${book.id}`,
    '/personas',
    '/presets',
    '/models',
    '/settings',
    '/data-bank',
    '/quick-replies',
    '/regex',
  ];
  const found: Record<string, string[]> = {};
  for (const path of pages) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    const wide = await offenders(page);
    if (wide.length > 0) found[path] = wide;
  }
  expect(found, JSON.stringify(found, null, 2)).toEqual({});
});
