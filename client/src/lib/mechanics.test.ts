// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment node
import { describe, expect, it } from 'vitest';
import cases from '../../../contract/mechanics-cases.json';
import { inventedRolls } from './mechanics';

describe('inventedRolls (contract/mechanics-cases.json)', () => {
  it.each(cases.cases)('$name', ({ text, spans }) => {
    expect(inventedRolls(text)).toEqual(spans);
  });
});
