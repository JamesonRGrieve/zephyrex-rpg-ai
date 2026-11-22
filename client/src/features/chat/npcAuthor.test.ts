// @vitest-environment node
// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import cases from '../../../../contract/npc-author-cases.json';
import { npcFigures } from './npcAuthor';

describe('the npc author cases both twins run', () => {
  it.each(cases.cases)('$name', ({ line, figures }) => {
    expect(npcFigures(line, cases.people)).toEqual(figures);
  });
});
