// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { roleplayPieces } from './roleplayText';

describe('roleplayPieces', () => {
  it('sets actions and speech apart from the narration', () => {
    expect(roleplayPieces('*waves* "Hi," she says. “Welcome.”')).toEqual([
      { kind: 'action', text: 'waves' },
      { kind: 'plain', text: ' ' },
      { kind: 'speech', text: '"Hi,"' },
      { kind: 'plain', text: ' she says. ' },
      { kind: 'speech', text: '“Welcome.”' },
    ]);
  });

  it('leaves a lone asterisk and plain text alone', () => {
    expect(roleplayPieces('2 * 3 is six')).toEqual([{ kind: 'plain', text: '2 * 3 is six' }]);
    expect(roleplayPieces('')).toEqual([]);
  });
});
