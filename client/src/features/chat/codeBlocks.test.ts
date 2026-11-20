// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { isRunnable, runReport, runnerDocument, textAndCode } from './codeBlocks';

describe('textAndCode', () => {
  it('splits prose from closed fences, keeping their language', () => {
    expect(textAndCode('Try this:\n```JS\nconsole.log(1)\n```\nNeat.')).toEqual([
      { kind: 'text', text: 'Try this:\n' },
      { kind: 'code', language: 'js', code: 'console.log(1)' },
      { kind: 'text', text: '\nNeat.' },
    ]);
  });

  it('leaves an unclosed fence as prose, as while a reply is still being written', () => {
    expect(textAndCode('```js\nlet a =')).toEqual([{ kind: 'text', text: '```js\nlet a =' }]);
  });

  it('keeps a fence with no language, which is shown but not run', () => {
    expect(textAndCode('```\nplain\n```')).toEqual([{ kind: 'code', language: '', code: 'plain' }]);
    expect(isRunnable('')).toBe(false);
    expect(isRunnable('javascript')).toBe(true);
    expect(isRunnable('python')).toBe(false);
  });
});

describe('runnerDocument', () => {
  it('refuses every request and keeps the code from closing its script', () => {
    const page = runnerDocument('run-1', '"</script><img src=x onerror=alert(1)>"');
    expect(page).toContain("default-src 'none'");
    expect(page).not.toContain('</script><img');
    expect(page.match(/<\/script>/g)).toHaveLength(1);
    expect(page).toContain('worker.terminate()');
  });
});

describe('runReport', () => {
  it('reads only a report for this run', () => {
    expect(runReport({ run: 'a', lines: ['2', 3], error: null, stopped: false }, 'a')).toEqual({
      run: 'a',
      lines: ['2'],
      error: null,
      stopped: false,
    });
    expect(runReport({ run: 'b', lines: ['x'] }, 'a')).toBeNull();
    expect(runReport('a', 'a')).toBeNull();
  });
});
