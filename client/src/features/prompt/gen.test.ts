// @vitest-environment node
// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import cases from '../../../../contract/gen-cases.json';
import type { ModelMessage } from './assemble';
import { genMessages } from './gen';

describe('the /gen cases both twins run (audit gap 5)', () => {
  it.each(cases.cases)('$name', ({ chat, instruction, raw, prefill, messages }) => {
    expect(genMessages(chat as ModelMessage[], instruction, raw, prefill)).toEqual(messages);
  });
});
