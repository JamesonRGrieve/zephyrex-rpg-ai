// @vitest-environment node
// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import cases from '../../../../contract/macro-cases.json';
import { expandAll, expandMacros, type MacroContext } from './macros';

describe('the macro cases both twins run (audit gap 1)', () => {
  it.each(cases.cases)('$name', ({ text, context, text_out: textOut, local_out: localOut, global_out: globalOut }) => {
    const { random, ...rest } = context as MacroContext & { random?: number[] };
    const draws = [...(random ?? [])];
    const result = expandAll(text, { ...rest, ...(random === undefined ? {} : { random: () => draws.shift() ?? 0 }) });
    expect(result.text).toBe(textOut);
    if (localOut !== null) expect(result.local).toEqual(localOut);
    if (globalOut !== null) expect(result.global).toEqual(globalOut);
  });
});

describe('expandMacros', () => {
  it('names the character and the persona, and leaves what needs a context as written', () => {
    expect(expandMacros('{{char}} greets {{user}}. {{random:a,b}} {char}', { char: 'Ada', user: 'Sam' })).toBe(
      'Ada greets Sam. {{random:a,b}} {char}',
    );
  });
});
