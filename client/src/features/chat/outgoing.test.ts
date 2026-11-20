// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { outgoing } from './outgoing';

describe('outgoing', () => {
  it('asks the table GM with /gm', () => {
    expect(outgoing('/gm can I search it?', 'ic')).toEqual({ text: 'can I search it?', channel: 'gm' });
  });

  it('sends on the switch’s channel', () => {
    expect(outgoing('  I open the door. ', 'ic')).toEqual({ text: 'I open the door.', channel: 'ic' });
    expect(outgoing('brb', 'ooc')).toEqual({ text: 'brb', channel: 'ooc' });
  });

  it('lets one message step out of character, or back in', () => {
    expect(outgoing('/ooc can we pause?', 'ic')).toEqual({ text: 'can we pause?', channel: 'ooc' });
    expect(outgoing('((snack break))', 'ic')).toEqual({ text: 'snack break', channel: 'ooc' });
    expect(outgoing('// lol', 'ic')).toEqual({ text: 'lol', channel: 'ooc' });
    expect(outgoing('/IC I draw my sword.', 'ooc')).toEqual({ text: 'I draw my sword.', channel: 'ic' });
  });

  it('sends nothing for an empty message', () => {
    expect(outgoing('   ', 'ic')).toBeNull();
    expect(outgoing('//', 'ic')).toBeNull();
  });
});
