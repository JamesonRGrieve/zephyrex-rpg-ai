// @vitest-environment node
// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { forbidText } from '~/features/prompt/assemble';
import cases from '../../../../contract/voice-guard-cases.json';
import {
  completeText,
  metaBreak,
  narrateSegments,
  plainDashes,
  replayOf,
  seatCut,
  speaksFor,
  strangerIn,
} from './voiceGuard';

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
  it.each(cases.complete_cases)('$name', ({ text, complete }) => {
    expect(completeText(text)).toBe(complete);
  });
  it.each(cases.replay_cases)('$name', ({ text, earlier, hit }) => {
    expect(replayOf(text, earlier)).toEqual(hit);
  });
  it.each(cases.forbid_cases)('$name', ({ forbid, text }) => {
    expect(forbidText(forbid)).toBe(text);
  });
  it.each(cases.seat_cut_cases)('$name', ({ text, seat, cut }) => {
    expect(seatCut(text, seat)).toBe(cut);
  });
  it.each(cases.dash_cases)('$name', ({ text, plain }) => {
    expect(plainDashes(text)).toBe(plain);
  });
  it.each(cases.meta_cases)('$name', ({ text, hit }) => {
    expect(metaBreak(text)).toEqual(hit);
  });
});
