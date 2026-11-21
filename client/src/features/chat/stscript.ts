// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * STscript (A37): SillyTavern's slash-command language, run by an interpreter over a parsed script,
 * never `eval`. Commands are piped with `|`, each one's result reaching the next as `{{pipe}}`;
 * variables are set and read (`/setvar`, `{{getvar::name}}`); `{: … :}` is a closure, run by
 * `/if`, `/while`, `/times` and `/run`. A step limit stops a loop that never ends.
 *
 * What touches the chat (a line, a reply, a pause, `/gen`) is asked of the host, so this module
 * holds no chat state and every command it knows can be tested without one.
 */

/** A command the chat carries out; its result (if any) becomes the pipe. */
export interface HostAction {
  name: string;
  /** The unnamed argument, macros filled in. */
  text: string;
  /** The named arguments (`key=value`), macros filled in. */
  args: Record<string, string>;
}

export interface ScriptHost {
  /** Carries out a chat command (`/sys`, `/sendas`, `/gen`, …); throws to stop the script. */
  act(action: HostAction): Promise<string | undefined>;
  /** Commands the host carries out, by name. */
  actions: ReadonlySet<string>;
  /** The chat's own variables and the install's global ones, read and written in place. */
  locals: Map<string, string>;
  globals: Map<string, string>;
  /** Fills in the chat's macros ({{user}}, {{char}}, …) after the script's own. */
  macros?: (text: string) => string;
  /** Shows a message to the person (`/echo`, `/popup`). */
  echo(text: string): void;
  /**
   * Asks the person (`/input`, `/buttons`): their text, or the option they chose; null when they
   * dismissed it. Without it, those commands stop the script.
   */
  ask?: (prompt: string, options: readonly string[] | null) => Promise<string | null>;
  /** Puts text in the composer for the person to edit and send (`/setinput`). */
  setInput?: (text: string) => void;
}

export interface ScriptResult {
  /** The last command's result. */
  pipe: string;
  /** Why it stopped early, if it did. */
  stopped: string | null;
}

/** The most commands one script runs, loops included, before it is stopped. */
export const STEP_LIMIT = 10_000;
/** The most times a `/while` runs its closure. */
export const LOOP_LIMIT = 100;

interface Call {
  name: string;
  args: Record<string, string | Closure>;
  unnamed: (string | Closure)[];
}

interface Closure {
  closure: Call[];
  /** The closure as written, so it can be kept in a variable and run later. */
  source: string;
}

const isClosure = (value: string | Closure | undefined): value is Closure =>
  typeof value === 'object' && value !== null && 'closure' in value;

class Stop extends Error {}

/** Splits at `separator` where it isn't inside quotes or a closure. */
function splitTop(text: string, separator: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quoted = false;
  let start = 0;
  for (let at = 0; at < text.length; at += 1) {
    const char = text[at];
    if (char === '\\') {
      at += 1;
      continue;
    }
    if (text.startsWith('{:', at)) {
      depth += 1;
      at += 1;
    } else if (text.startsWith(':}', at) && depth > 0) {
      depth -= 1;
      at += 1;
    } else if (char === '"' && depth === 0) {
      quoted = !quoted;
    } else if (char === separator && depth === 0 && !quoted) {
      parts.push(text.slice(start, at));
      start = at + 1;
    }
  }
  parts.push(text.slice(start));
  return parts;
}

/** The words of a command: quoted strings, closures and plain words, in order. */
function words(text: string): string[] {
  const out: string[] = [];
  let at = 0;
  while (at < text.length) {
    while (at < text.length && /\s/.test(text[at] as string)) at += 1;
    if (at >= text.length) break;
    const start = at;
    let depth = 0;
    let quoted = false;
    while (at < text.length) {
      const char = text[at] as string;
      if (char === '\\') {
        at += 2;
        continue;
      }
      if (text.startsWith('{:', at)) {
        depth += 1;
        at += 2;
        continue;
      }
      if (text.startsWith(':}', at) && depth > 0) {
        depth -= 1;
        at += 2;
        continue;
      }
      if (char === '"' && depth === 0) quoted = !quoted;
      else if (/\s/.test(char) && depth === 0 && !quoted) break;
      at += 1;
    }
    out.push(text.slice(start, at));
  }
  return out;
}

const unquote = (word: string): string =>
  word.length >= 2 && word.startsWith('"') && word.endsWith('"') ? word.slice(1, -1).replace(/\\"/g, '"') : word;

function value(word: string): string | Closure {
  const trimmed = word.trim();
  return trimmed.startsWith('{:') && trimmed.endsWith(':}')
    ? { closure: parse(trimmed.slice(2, -2)), source: trimmed }
    : unquote(trimmed);
}

/** A script as its commands, closures parsed in place. Text that isn't a command passes on as /pass. */
export function parse(script: string): Call[] {
  return splitTop(script, '|')
    .map((part) => part.trim())
    .filter((part) => part !== '')
    .map((part) => {
      const match = /^\/([\w-]+)([\s\S]*)$/.exec(part);
      if (match === null) return { name: 'pass', args: {}, unnamed: [part] };
      const call: Call = { name: (match[1] as string).toLowerCase(), args: {}, unnamed: [] };
      for (const word of words(match[2] as string)) {
        const named = /^([a-zA-Z_][\w-]*)=([\s\S]*)$/.exec(word);
        // Named arguments come first, as in SillyTavern; control commands also take them after
        // their closure (`/if … {: … :} else={: … :}`).
        const takesNamed = call.unnamed.length === 0 || CONTROL.has(call.name);
        if (named !== null && takesNamed) call.args[named[1] as string] = value(named[2] as string);
        else call.unnamed.push(value(word));
      }
      return call;
    });
}

const CONTROL = new Set(['if', 'while', 'times']);

/** Whether a line is a script rather than one plain command: it pipes, or uses STscript's own commands. */
export function isScript(line: string): boolean {
  const calls = line.trim().startsWith('/') ? parse(line) : [];
  return calls.length > 1 || calls.some((call) => SCRIPT_COMMANDS.has(call.name));
}

/** Math (SillyTavern's /add …): each takes numbers or variable names, unnamed, and gives a number. */
const MATH: Record<string, (values: number[]) => number> = {
  add: (values) => values.reduce((sum, value) => sum + value, 0),
  sub: (values) => values.slice(1).reduce((rest, value) => rest - value, values[0] ?? 0),
  mul: (values) => values.reduce((product, value) => product * value, 1),
  div: ([left = 0, right = 1]) => left / right,
  mod: ([left = 0, right = 1]) => left % right,
  pow: ([base = 0, exponent = 1]) => base ** exponent,
  max: (values) => Math.max(...values),
  min: (values) => Math.min(...values),
  abs: ([value = 0]) => Math.abs(value),
  round: ([value = 0]) => Math.round(value),
};

const SCRIPT_COMMANDS = new Set([
  ...Object.keys(MATH),
  // The chat's message commands, carried out by the host (A37): a script even on their own.
  'send',
  'trigger',
  'messages',
  'addswipe',
  'swipes-add',
  'swipes-count',
  'swipes-swipe',
  'del',
  'hide',
  'unhide',
  'rand',
  'input',
  'buttons',
  'setinput',
  'popup',
  'len',
  'trim',
  'upper',
  'lower',
  'substr',
  'replace',
  'test',
  'match',
  'pass',
  'echo',
  'setvar',
  'getvar',
  'addvar',
  'incvar',
  'decvar',
  'flushvar',
  'setglobalvar',
  'getglobalvar',
  'addglobalvar',
  'incglobalvar',
  'decglobalvar',
  'flushglobalvar',
  'if',
  'while',
  'times',
  'run',
  'abort',
]);

const RULES: Record<string, (left: string, right: string) => boolean> = {
  eq: (left, right) => left === right,
  neq: (left, right) => left !== right,
  lt: (left, right) => Number(left) < Number(right),
  gt: (left, right) => Number(left) > Number(right),
  lte: (left, right) => Number(left) <= Number(right),
  gte: (left, right) => Number(left) >= Number(right),
  in: (left, right) => right.includes(left),
  nin: (left, right) => !right.includes(left),
  not: (left) => left === '' || left === 'false' || left === '0',
};

/** The most characters a /test or /match pattern may have; long patterns are refused, not run. */
const PATTERN_LIMIT = 200;

/**
 * A pattern for /test and /match: `/body/flags` or a plain body, refused when too long or
 * malformed. Patterns with nested quantifiers (`(a+)+`) are refused too, so a script can't hang
 * the page on catastrophic backtracking.
 */
function safePattern(source: string): RegExp | null {
  if (source === '' || source.length > PATTERN_LIMIT || /\([^)]*[+*][^)]*\)[+*{]/.test(source)) return null;
  const literal = /^\/(.+)\/([a-z]*)$/s.exec(source);
  try {
    return literal === null
      ? new RegExp(source)
      : new RegExp(literal[1] as string, (literal[2] as string).replace(/g/g, ''));
  } catch {
    return null;
  }
}

/** A number's text without a trailing `.0`; anything else as given. */
const numberText = (value: number): string => (Number.isInteger(value) ? String(value) : String(Number(value.toFixed(10))));

/** Adds to a variable: numbers add; a JSON list gets the value appended; text is concatenated. */
function added(current: string, by: string): string {
  if (current !== '' && by !== '' && !Number.isNaN(Number(current)) && !Number.isNaN(Number(by)))
    return numberText(Number(current) + Number(by));
  if (current === '' && !Number.isNaN(Number(by)) && by !== '') return numberText(Number(by));
  try {
    const list: unknown = JSON.parse(current);
    if (Array.isArray(list)) return JSON.stringify([...list, by]);
  } catch {
    // not a list: concatenated below
  }
  return current + by;
}

/** Runs a script against a host. */
export async function runScript(script: string, host: ScriptHost): Promise<ScriptResult> {
  let steps = 0;
  const fill = (text: string, pipe: string, scope: Map<string, string>): string => {
    const own = text
      .replace(/\{\{pipe\}\}/g, pipe)
      .replace(/\{\{timesIndex\}\}/g, scope.get('timesIndex') ?? '')
      .replace(/\{\{getvar::([^}]+)\}\}/g, (_match, name: string) => scope.get(name) ?? host.locals.get(name) ?? '')
      .replace(/\{\{var::([^}]+)\}\}/g, (_match, name: string) => scope.get(name) ?? host.locals.get(name) ?? '')
      .replace(/\{\{getglobalvar::([^}]+)\}\}/g, (_match, name: string) => host.globals.get(name) ?? '');
    return host.macros === undefined ? own : host.macros(own);
  };

  const runCalls = async (calls: Call[], pipeIn: string, scope: Map<string, string>): Promise<string> => {
    let pipe = pipeIn;
    for (const call of calls) {
      steps += 1;
      if (steps > STEP_LIMIT) throw new Stop(`Stopped after ${STEP_LIMIT} steps`);
      pipe = await runCall(call, pipe, scope);
    }
    return pipe;
  };

  const runCall = async (call: Call, pipe: string, scope: Map<string, string>): Promise<string> => {
    const text = (item: string | Closure | undefined): string =>
      item === undefined ? '' : isClosure(item) ? item.source : fill(item, pipe, scope);
    const arg = (name: string): string => text(call.args[name]);
    const unnamedText = call.unnamed.map((item) => text(item)).join(' ');
    const closureOf = (item: string | Closure | undefined): Call[] | null => (isClosure(item) ? item.closure : null);
    const runClosure = async (item: string | Closure | undefined, inner = scope): Promise<string> => {
      const closure = closureOf(item);
      return closure === null ? text(item) : runCalls(closure, pipe, inner);
    };
    const vars = (global: boolean): Map<string, string> => (global ? host.globals : host.locals);
    const key = arg('key') || arg('name');

    const variable = call.name.match(/^(set|get|add|inc|dec|flush)(global)?var$/);
    if (variable !== null) {
      const store = vars(variable[2] !== undefined);
      // get, flush, inc and dec may name the variable without key=; set and add need key=.
      const name = key || (variable[1] === 'set' || variable[1] === 'add' ? '' : unnamedText);
      if (name === '') throw new Stop(`/${call.name} needs key=`);
      const current = store.get(name) ?? '';
      switch (variable[1]) {
        case 'set':
          store.set(name, unnamedText);
          return unnamedText;
        case 'get':
          return current;
        case 'add':
          store.set(name, added(current, unnamedText));
          return store.get(name) ?? '';
        case 'inc':
          store.set(name, numberText((Number(current) || 0) + 1));
          return store.get(name) ?? '';
        case 'dec':
          store.set(name, numberText((Number(current) || 0) - 1));
          return store.get(name) ?? '';
        default:
          store.delete(name);
          return '';
      }
    }

    const math = MATH[call.name];
    if (math !== undefined) {
      // A word that names a variable is its value, as in SillyTavern.
      const values = call.unnamed.map((item) => {
        const word = text(item);
        const named = scope.get(word) ?? host.locals.get(word) ?? host.globals.get(word);
        const value = Number(named ?? word);
        if (Number.isNaN(value)) throw new Stop(`/${call.name}: ${word} is not a number`);
        return value;
      });
      const result = math(values);
      if (!Number.isFinite(result)) throw new Stop(`/${call.name}: no finite answer`);
      return numberText(result);
    }

    switch (call.name) {
      case 'input':
      case 'buttons': {
        if (host.ask === undefined) throw new Stop(`/${call.name} needs a person to ask`);
        let options: string[] | null = null;
        if (call.name === 'buttons') {
          const labels: unknown = (() => {
            try {
              return JSON.parse(arg('labels'));
            } catch {
              return null;
            }
          })();
          if (!Array.isArray(labels) || labels.length === 0 || !labels.every((label) => typeof label === 'string'))
            throw new Stop('/buttons needs labels=["…", "…"]');
          options = labels;
        }
        const answer = await host.ask(unnamedText, options);
        return answer ?? '';
      }
      case 'setinput':
        if (host.setInput === undefined) throw new Stop('/setinput needs a composer');
        host.setInput(unnamedText);
        return unnamedText;
      case 'popup':
        host.echo(unnamedText);
        return pipe;
      case 'rand': {
        // A number for a script (a choice, a variation), never a game roll: rolls go through the VTT.
        const from = Number(arg('from') || 0);
        const to = Number(arg('to') || 1);
        const raw = from + Math.random() * (to - from);
        return arg('round') === '' ? numberText(raw) : String(Math.round(raw));
      }
      case 'len':
        return String(Array.from(unnamedText).length);
      case 'trim':
        return unnamedText.trim();
      case 'upper':
        return unnamedText.toUpperCase();
      case 'lower':
        return unnamedText.toLowerCase();
      case 'substr': {
        const characters = Array.from(unnamedText);
        const start = Number(arg('start') || 0);
        const end = arg('end') === '' ? characters.length : Number(arg('end'));
        return characters.slice(start, end).join('');
      }
      case 'replace': {
        const find = arg('pattern');
        if (find === '') throw new Stop('/replace needs pattern=');
        return unnamedText.split(find).join(arg('replacer'));
      }
      case 'test':
      case 'match': {
        const pattern = safePattern(arg('pattern'));
        if (pattern === null) throw new Stop(`/${call.name}: pattern= is not a usable regular expression`);
        if (call.name === 'test') return String(pattern.test(unnamedText));
        return unnamedText.match(pattern)?.[0] ?? '';
      }
      case 'pass':
        return unnamedText;
      case 'echo':
        host.echo(unnamedText);
        return pipe;
      case 'abort':
        throw new Stop(unnamedText || 'Stopped by /abort');
      case 'run': {
        const name = unnamedText;
        const stored = scope.get(name) ?? host.locals.get(name);
        if (closureOf(call.unnamed[0]) !== null) return runClosure(call.unnamed[0]);
        if (stored === undefined) throw new Stop(`/run: nothing named ${name}`);
        return runCalls(parse(stored.replace(/^\{:|:\}$/g, '')), pipe, scope);
      }
      case 'if': {
        const rule = RULES[arg('rule') || 'eq'];
        if (rule === undefined) throw new Stop(`/if: no rule ${arg('rule')}`);
        const passes = rule(arg('left'), arg('right'));
        if (passes) return runClosure(call.unnamed[0]);
        return call.args.else === undefined ? pipe : runClosure(call.args.else);
      }
      case 'while': {
        const rule = RULES[arg('rule') || 'eq'];
        if (rule === undefined) throw new Stop(`/while: no rule ${arg('rule')}`);
        let out = pipe;
        for (let turn = 0; turn < LOOP_LIMIT; turn += 1) {
          // Each test reads the variables afresh: the closure is what changes them.
          if (!rule(text(call.args.left), text(call.args.right))) return out;
          out = await runClosure(call.unnamed[0]);
        }
        return out;
      }
      case 'times': {
        const count = Math.max(0, Math.min(LOOP_LIMIT, Math.floor(Number(text(call.unnamed[0])) || 0)));
        let out = pipe;
        for (let index = 0; index < count; index += 1) {
          const inner = new Map(scope);
          inner.set('timesIndex', String(index));
          out = await runClosure(call.unnamed[1], inner);
        }
        return out;
      }
      default: {
        if (!host.actions.has(call.name)) throw new Stop(`/${call.name} is not a command`);
        const args = Object.fromEntries(Object.entries(call.args).map(([name, item]) => [name, text(item)]));
        const result = await host.act({ name: call.name, text: unnamedText, args });
        return result ?? pipe;
      }
    }
  };

  try {
    const pipe = await runCalls(parse(script), '', new Map());
    return { pipe, stopped: null };
  } catch (error) {
    if (error instanceof Stop) return { pipe: '', stopped: error.message };
    throw error;
  }
}
