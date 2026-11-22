// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Whether a line names someone (the operator, 2026-11-22: "How was this ambiguous?" when "Stares at
 * the barkeep" was asked about, with The Barkeep among the choices). Their name without a leading
 * article, as whole words, ignoring case; or, for a longer name, its given name.
 */
const ARTICLE = /^(?:the|a|an)\s+/i;
const TITLES = new Set([
  'sister',
  'brother',
  'father',
  'mother',
  'lord',
  'lady',
  'sir',
  'dame',
  'captain',
  'chief',
  'master',
  'mistress',
  'old',
  'young',
]);

const phrase = (text: string, words: string) =>
  new RegExp(`(?:^|[^\\p{L}])${words.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:$|[^\\p{L}])`, 'iu').test(text);

export function namesIn(text: string, name: string): boolean {
  const bare = name.trim().replace(ARTICLE, '');
  if (bare === '') return false;
  if (phrase(text, bare)) return true;
  const words = bare.split(/\s+/).filter((word) => !TITLES.has(word.toLowerCase()));
  const given = words[0] ?? '';
  return words.length > 1 && given.length >= 3 && phrase(text, given);
}
