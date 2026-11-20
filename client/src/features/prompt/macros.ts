// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * SillyTavern's card macros, so imported cards read as their authors wrote them: `{{char}}` is the
 * character's name and `{{user}}` the persona's, case-insensitive, with the older `<BOT>` and
 * `<USER>` spellings.
 */

export interface MacroNames {
  char: string;
  user: string;
}

const MACROS: readonly [RegExp, keyof MacroNames][] = [
  [/\{\{\s*char\s*\}\}/gi, 'char'],
  [/\{\{\s*user\s*\}\}/gi, 'user'],
  [/<BOT>/g, 'char'],
  [/<USER>/g, 'user'],
];

export function expandMacros(text: string, names: MacroNames): string {
  return MACROS.reduce((result, [pattern, name]) => result.replace(pattern, names[name]), text);
}
