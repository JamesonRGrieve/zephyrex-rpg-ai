// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import type { Character } from '~/features/data/records';
import { draftOf, isChanged } from './CharacterEditor';
import { ADA_DRAFT } from './fixtures';

const SAVED: Character = {
  ...ADA_DRAFT,
  id: 'c-ada',
  created_at: '2026-11-20T00:00:00.000000',
  updated_at: '2026-11-20T00:00:00.000000',
  favourite: false,
  folder: '',
  extensions: {},
  lorebook_id: null,
};

describe('CharacterEditor helpers', () => {
  it('drafts only the card fields', () => {
    expect(draftOf(SAVED)).toEqual(ADA_DRAFT);
  });

  it('sees a change, and none in an untouched draft', () => {
    expect(isChanged(draftOf(SAVED), SAVED)).toBe(false);
    expect(isChanged({ ...draftOf(SAVED), name: 'Ada' }, SAVED)).toBe(true);
  });
});
