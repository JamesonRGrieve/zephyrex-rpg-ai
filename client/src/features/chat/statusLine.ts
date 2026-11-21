// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * A campaign's status line (the operator, 2026-11-21): one spoiler-safe sentence that tells campaigns
 * apart, rewritten by the summary model from the rolling summary and the latest story lines only.
 * Pure, and held to contract/status-line-cases.json with ai_chat/StatusLine.py.
 */
import { STATUS_LINE } from '~/contract';
import { plainDashes } from './voiceGuard';

/** What the summary model is asked: the instruction, then the story so far and the latest lines. */
export function statusMessages(summary: string, lines: readonly string[]): { role: 'system' | 'user'; content: string }[] {
  const latest = lines.slice(-STATUS_LINE.lines);
  const parts = [
    ...(summary.trim() === '' ? [] : [`${STATUS_LINE.summary_heading}\n${summary.trim()}`]),
    ...(latest.length === 0 ? [] : [`${STATUS_LINE.lines_heading}\n${latest.join('\n')}`]),
  ];
  return [
    { role: 'system', content: STATUS_LINE.prompt },
    { role: 'user', content: parts.join('\n\n') },
  ];
}

/** The model's answer as a status line: its first line, unquoted, without dashes, at most the limit. */
export function statusClean(text: string): string {
  const first = (text.split('\n').find((line) => line.trim() !== '') ?? '').trim();
  const unquoted = first.replace(/^["“'‘]+|["”'’]+$/gu, '').trim();
  const plain = plainDashes(unquoted).replace(/\s+/gu, ' ');
  if (plain.length <= STATUS_LINE.characters) return plain;
  const cut = plain.slice(0, STATUS_LINE.characters - 3);
  const space = cut.lastIndexOf(' ');
  return `${(space > 0 ? cut.slice(0, space) : cut).replace(/[\s,;:.]+$/u, '')}...`;
}
