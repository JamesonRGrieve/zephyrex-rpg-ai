// SPDX-License-Identifier: AGPL-3.0-or-later
/** A chat's script and macro variables (A37, {{getvar}} / /setvar): names to string values. */

/** Whether two variable sets hold the same names and values, so an unchanged set isn't saved again. */
export function sameVariables(a: Readonly<Record<string, string>>, b: Readonly<Record<string, string>>): boolean {
  const names = Object.keys(a);
  return names.length === Object.keys(b).length && names.every((name) => Object.hasOwn(b, name) && b[name] === a[name]);
}
