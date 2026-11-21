// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment node
import { describe, expect, it } from 'vitest';
import cases from '../../../../contract/tool-cases.json';
import {
  assembleToolCalls,
  checkToolCalls,
  type Refusal,
  type ToolCall,
  type ToolCallChunk,
  toolFollowUp,
} from './toolCalls';

describe('tool calls (contract/tool-cases.json, shared with the server)', () => {
  it.each(cases.assemble)('assemble: $name', (testCase) => {
    expect(assembleToolCalls(testCase.chunks as ToolCallChunk[])).toEqual(testCase.calls);
  });

  it.each(cases.check)('check: $name', (testCase) => {
    expect(checkToolCalls(testCase.calls, testCase.offered)).toEqual(testCase.checked);
  });

  it.each(cases.follow_up)('follow-up: $name', (testCase) => {
    expect(
      toolFollowUp(
        testCase.calls as ToolCall[],
        testCase.results as Record<string, string>,
        testCase.refused as Record<string, Refusal>,
      ),
    ).toEqual(testCase.messages);
  });
});
