// @vitest-environment node
// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import cases from '../../../../contract/status-line-cases.json';
import { statusClean, statusMessages } from './statusLine';

describe('the status line cases both twins run', () => {
  it.each(cases.messages_cases)('$name', ({ summary, lines, messages }) => {
    expect(statusMessages(summary, lines)).toEqual(messages);
  });
  it.each(cases.clean_cases)('$name', ({ text, line }) => {
    expect(statusClean(text)).toBe(line);
  });
});
