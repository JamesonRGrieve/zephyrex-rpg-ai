// @vitest-environment node
// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import cases from '../../../../contract/voice-guard-cases.json';
import { narrateSegments, speaksFor, strangerIn } from './voiceGuard';

describe('the voice guard cases both twins run', () => {
  it.each(cases.segment_cases)('$name', ({ text, cast, seat, segments }) => {
    expect(narrateSegments(text, cast, seat)).toEqual(segments);
  });
  it.each(cases.speaks_cases)('$name', ({ text, refs, hit }) => {
    expect(speaksFor(text, refs)).toEqual(hit);
  });
  it.each(cases.stranger_cases)('$name', ({ text, hit }) => {
    expect(strangerIn(text)).toEqual(hit);
  });
});
