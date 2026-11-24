// @vitest-environment node
// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import cases from '../../../../contract/player-lines-cases.json';
import {
  type PlayerLine,
  dropStaleLocation,
  formatPlayerLines,
  lineSpeaker,
  locationLine,
  parsePlayerLines,
  stripMarkup,
} from './playerLines';

describe('the structured lines cases both twins run', () => {
  it.each(cases.parse_cases)('$name', ({ text, items }) => {
    expect(parsePlayerLines(text, cases.people)).toEqual(items);
  });
  it('formats what it parses', () => {
    expect(formatPlayerLines(cases.format_case.items as PlayerLine[], cases.people)).toBe(cases.format_case.text);
    const owned = cases.possessive_format_case;
    expect(formatPlayerLines(owned.items as PlayerLine[], cases.people)).toBe(owned.text);
    expect(parsePlayerLines(owned.text, cases.people)).toEqual(owned.items);
    expect(formatPlayerLines(cases.target_format_case.items as PlayerLine[], cases.people)).toBe(
      cases.target_format_case.text,
    );
  });
  it.each(cases.location_cases.cases)('$name', ({ text, line }) => {
    expect(locationLine(text, cases.location_cases.locations)).toEqual(line);
  });
  it.each(cases.markup_cases)('$name', ({ text, plain }) => {
    expect(stripMarkup(text)).toBe(plain);
  });
  it.each(cases.speaker_cases)('the speaker of "$line"', ({ line, speaker }) => {
    expect(lineSpeaker(line, cases.people)).toBe(speaker);
  });
});

describe('a stale location line goes at save (the banner is server truth)', () => {
  it.each(cases.stale_location_cases)('$name', ({ text, current, kept }) => {
    expect(dropStaleLocation(text, current)).toBe(kept);
  });
});

describe('a banner with where it is', () => {
  it('matches and keeps the place, and reads as the whole', () => {
    expect(
      locationLine('[location: The Pale Tallow | Transit Levels, Desoleum]\nSmoke.', [
        { id: 'l1', name: 'The Pale Tallow' },
      ]),
    ).toEqual({
      name: 'The Pale Tallow',
      location_id: 'l1',
    });
    expect(dropStaleLocation('[location: The Pale Tallow | Desoleum]\nSmoke.', { name: 'The Pale Tallow' })).toContain(
      '[location:',
    );
  });
});
