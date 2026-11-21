// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import cases from '../../../../contract/instruct-cases.json';
import type { InstructTemplateId } from '~/contract';
import type { ModelMessage } from './assemble';
import { activeTemplate, instructStops, renderInstruct, renderStoryString } from './instruct';

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

describe('renderStoryString (contract/instruct-cases.json story_cases, audit gap 4)', () => {
  it.each(cases.story_cases)('$name', ({ story, values, text }) => {
    expect(renderStoryString(story, values)).toBe(text);
  });
});

describe('activeTemplate (contract/instruct-cases.json active_cases, audit gap 4)', () => {
  it.each(cases.active_cases)('$name', ({ model, templates, active }) => {
    expect(activeTemplate(model, templates)?.id ?? null).toBe(active);
  });
});
