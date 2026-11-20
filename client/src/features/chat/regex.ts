// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Regex scripts (A33), SillyTavern's find-and-replace on chat text. Pure, and held to
 * contract/regex-cases.json, which the SaaS server's Regex.py runs too.
 *
 * A script's `find` is `/pattern/flags` (flags from `g i m s` only, so JavaScript and Python read
 * it alike) or a bare pattern. `replace` may use `$1`–`$99`, `$&` or `{{match}}` (the whole match)
 * and `$$`; a group number the pattern does not have stays as written, as in JavaScript. A script
 * applies to text at its placements (`user_input`, `ai_output`), to one target: `stored` (the
 * message as saved), `display` (only as shown) or `prompt` (only as the model reads it), and, for
 * display and prompt, only at depths (0 = the newest message) within its bounds. A pattern that
 * does not compile is skipped.
 */
import { REGEX } from '~/contract';

export type RegexPlacement = (typeof REGEX.placements)[number];
export type RegexTarget = (typeof REGEX.targets)[number];

export interface RegexScript {
  find: string;
  replace: string;
  placements: readonly RegexPlacement[];
  display_only: boolean;
  prompt_only: boolean;
  min_depth: number | null;
  max_depth: number | null;
  enabled: boolean;
}

const DELIMITED = /^\/(.*)\/([a-z]*)$/s;
const TOKEN = /\$\$|\$&|\{\{match\}\}|\$(\d\d?)/g;

/** The compiled pattern (global when the script replaces every match), or null when invalid. */
export function compileFind(find: string): RegExp | null {
  const delimited = DELIMITED.exec(find);
  const pattern = delimited === null ? find : (delimited[1] as string);
  const flags = delimited === null ? '' : (delimited[2] as string);
  if (pattern === '' || [...flags].some((flag) => !REGEX.flags.includes(flag)) || new Set(flags).size !== flags.length) return null;
  try {
    return new RegExp(pattern, flags);
  } catch {
    return null;
  }
}

/** How many capture groups a pattern has (it always matches the empty string once `|` is added). */
function groupCount(pattern: RegExp): number {
  return (new RegExp(`${pattern.source}|`).exec('') as RegExpExecArray).length - 1;
}

function expand(replacement: string, match: string, groups: readonly (string | undefined)[]): string {
  return replacement.replace(TOKEN, (text, digits: string | undefined) => {
    if (text === '$$') return '$';
    if (text === '$&' || text === '{{match}}') return match;
    const number = Number(digits);
    if (number > 0 && number <= groups.length) return groups[number - 1] ?? '';
    const first = Number(digits?.[0]);
    if (digits?.length === 2 && first > 0 && first <= groups.length) return (groups[first - 1] ?? '') + digits[1];
    return text;
  });
}

export function applies(script: RegexScript, placement: RegexPlacement, target: RegexTarget, depth: number | null): boolean {
  if (!script.enabled || !script.placements.includes(placement)) return false;
  const scriptTarget: RegexTarget = script.display_only ? 'display' : script.prompt_only ? 'prompt' : 'stored';
  if (scriptTarget !== target) return false;
  if (depth === null) return true;
  return (script.min_depth === null || depth >= script.min_depth) && (script.max_depth === null || depth <= script.max_depth);
}

/** `text` after every applicable script, in order. */
export function applyRegex(text: string, scripts: readonly RegexScript[], placement: RegexPlacement, target: RegexTarget, depth: number | null = null): string {
  return scripts.reduce((current, script) => {
    if (!applies(script, placement, target, depth)) return current;
    const pattern = compileFind(script.find);
    if (pattern === null) return current;
    const groups = groupCount(pattern);
    return current.replace(pattern, (match: string, ...rest: unknown[]) => expand(script.replace, match, rest.slice(0, groups) as (string | undefined)[]));
  }, text);
}
