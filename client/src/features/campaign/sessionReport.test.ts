// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment node
import { describe, expect, it } from 'vitest';
import cases from '../../../../contract/report-cases.json';
import { REPORT_SYSTEM, reportMentions, reportPrompt, type SessionLine } from './sessionReport';

const [ordered, long] = cases.prompt as [(typeof cases.prompt)[0], { lines_count: number; first_kept: number }];

describe('reportPrompt (contract/report-cases.json, shared with the server)', () => {
  it(ordered.name, () => {
    expect(reportPrompt(ordered.lines as SessionLine[])).toEqual([
      { role: 'system', content: REPORT_SYSTEM },
      { role: 'user', content: ordered.user },
    ]);
  });

  it('only the last lines when the session is long', () => {
    const lines = Array.from({ length: long.lines_count }, (_, at) => ({
      speaker: 'GM',
      text: `line ${at}`,
      channel: 'story',
    }));
    const user = reportPrompt(lines)[1]?.content ?? '';
    expect(user.split('\n')[0]).toBe(`GM: line ${long.first_kept}`);
    expect(user.split('\n')).toHaveLength(cases.max_lines);
  });
});

describe('reportMentions (contract/report-cases.json, shared with the server)', () => {
  it.each(cases.mentions)('$name', (testCase) => {
    expect(reportMentions(testCase.text, testCase.entities)).toEqual(testCase.mentioned);
  });
});
