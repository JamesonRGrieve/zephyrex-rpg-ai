// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { parseCommand } from './commands';

describe('parseCommand', () => {
  it('leaves plain lines and channel switches alone', () => {
    expect(parseCommand('Hello there.')).toBeNull();
    expect(parseCommand('/ooc brb')).toBeNull();
    expect(parseCommand('/gm can I search it?')).toBeNull();
  });

  it('reads each command', () => {
    expect(parseCommand('/sys  The lights flicker. ')).toEqual({ name: 'sys', text: 'The lights flicker.' });
    expect(parseCommand('/NARRATE')).toEqual({ name: 'narrate' });
    expect(parseCommand('/xcard')).toEqual({ name: 'xcard' });
  });

  it('finds who /sendas speaks as: quoted, a cast name with spaces, or the first word', () => {
    expect(parseCommand('/sendas "Ada Vance" Mind the coolant.')).toEqual({
      name: 'sendas',
      character: 'Ada Vance',
      text: 'Mind the coolant.',
    });
    expect(parseCommand('/sendas ada vance Mind it.', ['Ada Vance'])).toEqual({
      name: 'sendas',
      character: 'Ada Vance',
      text: 'Mind it.',
    });
    expect(parseCommand('/sendas Bram Stew is up.')).toEqual({ name: 'sendas', character: 'Bram', text: 'Stew is up.' });
  });

  it('says what is wrong with a line that is not a command', () => {
    expect(parseCommand('/sys')).toEqual({ unknown: '/sys needs the line to add' });
    expect(parseCommand('/sendas Bram')).toEqual({ unknown: '/sendas needs a name and a line' });
    expect(parseCommand('/dance')).toEqual({ unknown: '/dance is not a command (try /help)' });
    expect(parseCommand('/search tidal locking')).toEqual({ name: 'search', query: 'tidal locking' });
    expect(parseCommand('/search')).toEqual({ unknown: '/search needs what to search for' });
  });
});
