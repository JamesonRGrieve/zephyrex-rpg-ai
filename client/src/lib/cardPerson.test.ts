// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { cardLink, LINK } from './cardPerson';

describe('cardLink (a card keeps its wiki person in its extensions)', () => {
  it('reads a whole link and nothing less', () => {
    expect(cardLink({ [LINK]: { person_id: 'p1', campaign_id: 'c1' } })).toEqual({ person_id: 'p1', campaign_id: 'c1' });
    expect(cardLink({ [LINK]: { person_id: 'p1' } })).toBeNull();
    expect(cardLink(null)).toBeNull();
  });
});
