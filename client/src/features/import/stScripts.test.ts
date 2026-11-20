// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { quickRepliesFromJson, regexScriptsFromJson } from './stScripts';

describe('SillyTavern regex scripts', () => {
  it('maps a script, and refuses what this app cannot run alike', () => {
    const { scripts, refused } = regexScriptsFromJson([
      {
        scriptName: 'Italics',
        findRegex: '/\\*(.+?)\\*/g',
        replaceString: '<i>$1</i>',
        placement: [2, 5],
        markdownOnly: true,
        minDepth: 1,
        maxDepth: null,
      },
      { scriptName: 'Sticky', findRegex: '/a/y', placement: [1] },
      { scriptName: 'Slash only', findRegex: '/a/', placement: [3] },
      { scriptName: 'Off', findRegex: 'x', placement: [1], disabled: true },
    ]);
    expect(scripts).toEqual([
      {
        name: 'Italics',
        find: '/\\*(.+?)\\*/g',
        replace: '<i>$1</i>',
        placements: ['ai_output'],
        display_only: true,
        prompt_only: false,
        min_depth: 1,
        max_depth: null,
        enabled: true,
        position: 0,
      },
      {
        name: 'Off',
        find: 'x',
        replace: '',
        placements: ['user_input'],
        display_only: false,
        prompt_only: false,
        min_depth: null,
        max_depth: null,
        enabled: false,
        position: 3,
      },
    ]);
    expect(refused).toEqual(['Sticky', 'Slash only']);
  });
});

describe('SillyTavern Quick Reply sets', () => {
  it('maps each button that has a label and a line', () => {
    expect(
      quickRepliesFromJson({
        name: 'Set',
        qrList: [
          { label: 'Look', message: 'I look around.' },
          { title: 'Hidden', message: 'x', isHidden: true },
          { label: 'Empty', message: ' ' },
        ],
      }),
    ).toEqual([
      { label: 'Look', message: 'I look around.', action: 'send', channel: 'ic', enabled: true, position: 0 },
      { label: 'Hidden', message: 'x', action: 'send', channel: 'ic', enabled: false, position: 1 },
    ]);
  });
});
