// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * A turn through the queued composer (docs/DESIGN.md, Structured lines): Say, Do and Out of game
 * items, sent at once. The Story / Table talk / Ask the GM switch is gone (the operator, 2026-11-21).
 */
import type { Page } from '@playwright/test';

/** Queues one item and fills it, without sending. */
export async function queue(page: Page, kind: 'Say' | 'Do' | 'Out of game', text: string): Promise<void> {
  await page.getByRole('button', { name: kind, exact: true }).click();
  const label = kind === 'Say' ? 'What is said' : kind === 'Do' ? 'What is done' : 'Out of game';
  await page.getByLabel(label, { exact: true }).last().fill(text);
}

/** Queues one item and sends the turn. */
export async function act(page: Page, kind: 'Say' | 'Do' | 'Out of game', text: string): Promise<void> {
  await queue(page, kind, text);
  await page.getByRole('button', { name: /^Send/ }).click();
}
