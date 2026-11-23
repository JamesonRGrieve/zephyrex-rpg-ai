// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment node
import { describe, expect, it } from 'vitest';
import cases from '../../../contract/table-voice-cases.json';
import { tableVoiceNote, tableVoiceProblem } from './tableVoice';

describe('tableVoiceProblem (contract/table-voice-cases.json)', () => {
  it.each(cases.cases)('$name', ({ answer, problem }) => {
    expect(tableVoiceProblem(answer)).toEqual(problem);
  });
  it('names the wrong voice in the retry', () => {
    expect(tableVoiceNote({ kind: 'npc', name: 'Sergeant Horvec' })).toContain('Sergeant Horvec');
    expect(tableVoiceNote({ kind: 'assistant', name: null })).toContain('assistant');
  });
});
