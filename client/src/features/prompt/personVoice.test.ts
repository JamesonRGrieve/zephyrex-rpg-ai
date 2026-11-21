// @vitest-environment node
// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import cases from '../../../../contract/person-voice-cases.json';
import { personCharacter, type WikiPerson } from './personVoice';

describe('the person voice cases both twins run', () => {
  it.each(cases.cases)('$name', ({ person, character }) => {
    expect(personCharacter(person as WikiPerson)).toEqual(character);
  });
});
