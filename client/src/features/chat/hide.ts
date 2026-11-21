// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Hiding messages from the prompt (SillyTavern's eye toggle and /hide, audit gap 10): a hidden
 * message stays on screen but the model never reads it. Unlike the X-card (A25), which takes a
 * reply out of the story for safety, hiding is the person's own context control, and undone the
 * same way. `/hide` and `/unhide` name lines as `/messages` does (scriptMessages' ranges).
 */
import { rangeIndexes } from './scriptMessages';

export interface Hideable {
  id: string;
  hidden?: boolean;
  x_carded?: boolean;
}

/** Whether the model reads a message: neither hidden by the person nor X-carded. */
export function readByModel(message: Hideable): boolean {
  return message.hidden !== true && message.x_carded !== true;
}

/**
 * The messages `/hide <range>` (or `/unhide`) changes: those the range names on the branch whose
 * hidden state differs from `hidden`. An empty range names none here (unlike `/messages`): hiding
 * every line by accident would empty the prompt.
 */
export function toggled<M extends Hideable>(branch: readonly M[], range: string, hidden: boolean): M[] {
  if (range.trim() === '') return [];
  return rangeIndexes(range, branch.length)
    .map((index) => branch[index] as M)
    .filter((message) => (message.hidden === true) !== hidden);
}
