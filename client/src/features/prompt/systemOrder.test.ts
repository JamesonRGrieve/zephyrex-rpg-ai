// @vitest-environment node
// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import cases from '../../../../contract/system-order-cases.json';
import { systemsBeforeLastUser } from './systemOrder';

describe('the system order cases both twins run', () => {
  it.each(cases.cases)('$name', ({ messages, ordered }) => {
    expect(systemsBeforeLastUser(messages)).toEqual(ordered);
  });
});
