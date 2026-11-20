// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import cases from '../../../../contract/instruct-cases.json';
import type { InstructTemplateId } from '~/contract';
import type { ModelMessage } from './assemble';
import { instructStops, renderInstruct } from './instruct';

describe('renderInstruct (contract/instruct-cases.json, shared with the server)', () => {
  it.each(cases.cases)('$name', (testCase) => {
    expect(
      renderInstruct(testCase.messages as ModelMessage[], testCase.template as InstructTemplateId, testCase.open_last),
    ).toBe(testCase.prompt);
  });

  it('gives each template its stop strings', () => {
    expect(instructStops('chatml')).toEqual(['<|im_end|>']);
  });
});
