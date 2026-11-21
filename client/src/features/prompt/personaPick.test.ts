// @vitest-environment node
// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import cases from '../../../../contract/persona-cases.json';
import { personaBooks, personaFor, personaFromCharacter } from './personaPick';

const byId = (id: string | null) => cases.personas.find((persona) => persona.id === id) ?? null;

describe('the persona cases both twins run (audit gap 9)', () => {
  it.each(cases.pick_cases)('$name', ({ chosen, characters, picked }) => {
    expect(personaFor(chosen, characters, cases.personas)?.id ?? null).toBe(picked);
  });
  it(cases.no_default_case.name, () => {
    const none = cases.personas.map((persona) => ({ ...persona, is_default: false }));
    const { chosen, characters, picked } = cases.no_default_case;
    expect(personaFor(chosen, characters, none)?.id ?? null).toBe(picked);
  });
  it.each(cases.book_cases)('$name', ({ persona, books, books_after: after }) => {
    expect(personaBooks(byId(persona), books)).toEqual(after);
  });
});

describe('a persona made from a character (audit gap 9)', () => {
  it('keeps the name and picture, reads {{char}} as {{user}}, and fits the description', () => {
    expect(
      personaFromCharacter({ name: 'Ada', description: '{{char}} fixes engines. {{Char}} hums.', avatar: 'a.png' }, 23),
    ).toEqual({ name: 'Ada', description: '{{user}} fixes engines.', avatar: 'a.png' });
  });
});
