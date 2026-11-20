// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it, vi } from 'vitest';
import { type HostAction, LOOP_LIMIT, type ScriptHost, isScript, parse, runScript } from './stscript';

function host(answers: Record<string, string> = {}): ScriptHost & { acted: HostAction[]; echoed: string[] } {
  const acted: HostAction[] = [];
  const echoed: string[] = [];
  return {
    acted,
    echoed,
    actions: new Set(['sys', 'sendas', 'gen']),
    act: vi.fn(async (action: HostAction) => {
      acted.push(action);
      return answers[action.name];
    }),
    locals: new Map(),
    globals: new Map(),
    macros: (text) => text.replace(/\{\{user\}\}/g, 'Ana'),
    echo: (text) => echoed.push(text),
  };
}

describe('parse', () => {
  it('splits on pipes outside quotes and closures', () => {
    const calls = parse('/echo "a | b" | /if left=1 right=1 {: /echo x | /echo y :} | plain text');
    expect(calls.map((call) => call.name)).toEqual(['echo', 'if', 'pass']);
    expect(calls[0]?.unnamed).toEqual(['a | b']);
  });
});

describe('isScript', () => {
  it('is a script when it pipes or uses STscript’s own commands; a lone chat command is not', () => {
    expect(isScript('/sys Night falls.')).toBe(false);
    expect(isScript('/setvar key=hp 10')).toBe(true);
    expect(isScript('/gen Describe the tavern | /sys {{pipe}}')).toBe(true);
    expect(isScript('hello | there')).toBe(false);
  });
});

describe('runScript', () => {
  it('pipes each result into the next command', async () => {
    const chat = host({ gen: 'A smoky tavern.' });
    const result = await runScript('/gen Describe the tavern | /sys {{pipe}}', chat);
    expect(chat.acted).toEqual([
      { name: 'gen', text: 'Describe the tavern', args: {} },
      { name: 'sys', text: 'A smoky tavern.', args: {} },
    ]);
    expect(result).toEqual({ pipe: 'A smoky tavern.', stopped: null });
  });

  it('sets, reads and adds to variables, chat and global apart', async () => {
    const chat = host();
    await runScript('/setvar key=hp 10 | /addvar key=hp 5 | /incvar hp | /setglobalvar key=hp 1', chat);
    expect(chat.locals.get('hp')).toBe('16');
    expect(chat.globals.get('hp')).toBe('1');
    await runScript('/setvar key=bag ["rope"] | /addvar key=bag torch', chat);
    expect(chat.locals.get('bag')).toBe('["rope","torch"]');
    const read = await runScript('/echo {{getvar::hp}} for {{user}} | /getglobalvar hp', chat);
    expect(chat.echoed).toEqual(['16 for Ana']);
    expect(read.pipe).toBe('1');
  });

  it('branches with /if and its else', async () => {
    const chat = host();
    chat.locals.set('hp', '3');
    await runScript('/if left={{getvar::hp}} right=5 rule=lt {: /echo low :} else={: /echo fine :}', chat);
    await runScript('/if left={{getvar::hp}} right=1 rule=lt {: /echo dying :} else={: /echo fine :}', chat);
    expect(chat.echoed).toEqual(['low', 'fine']);
  });

  it('loops with /times and /while, the variables read afresh each turn', async () => {
    const chat = host();
    await runScript('/times 3 {: /addvar key=log {{timesIndex}} :}', chat);
    expect(chat.locals.get('log')).toBe('3');
    await runScript('/setvar key=n 0 | /while left={{getvar::n}} right=4 rule=lt {: /incvar n :}', chat);
    expect(chat.locals.get('n')).toBe('4');
  });

  it('stops a loop that never ends, and an unknown or aborted command', async () => {
    const chat = host();
    await runScript('/setvar key=n 0 | /while left=1 right=1 {: /incvar n :}', chat);
    expect(chat.locals.get('n')).toBe(String(LOOP_LIMIT));
    expect((await runScript('/frobnicate', chat)).stopped).toBe('/frobnicate is not a command');
    const aborted = await runScript('/echo one | /abort enough | /echo two', chat);
    expect(aborted.stopped).toBe('enough');
    expect(chat.echoed).toEqual(['one']);
  });

  it('keeps a closure in a variable and runs it later', async () => {
    const chat = host();
    await runScript('/setvar key=greet {: /echo hello {{user}} :} | /run greet', chat);
    expect(chat.echoed).toEqual(['hello Ana']);
  });

  it('passes named arguments to the chat’s own commands', async () => {
    const chat = host();
    await runScript('/sendas name=Mira The door creaks.', chat);
    expect(chat.acted[0]).toEqual({ name: 'sendas', text: 'The door creaks.', args: { name: 'Mira' } });
  });
});
