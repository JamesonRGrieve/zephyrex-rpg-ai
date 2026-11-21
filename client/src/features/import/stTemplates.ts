// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * SillyTavern's instruct and context templates in (audit gap 4), as a person's own template. Pure.
 *
 * It reads an instruct template (`input_sequence`, `output_sequence`, `system_sequence`, their
 * suffixes, `stop_sequence`, `wrap`, `names` or `names_behavior`, `activation_regex`), a context
 * template (`story_string`, `example_separator`, `chat_start`), or a master export holding both
 * (`{ instruct, context }`). With `wrap`, each sequence is followed by a line break, as SillyTavern
 * wraps them. A value too long for this app is left out and named, and so is every key with no
 * counterpart here, so the person sees what didn't come.
 */
import { INSTRUCT_CUSTOM, LIMITS } from '~/contract';

export interface ImportedTemplate {
  name: string;
  start: string;
  system_prefix: string;
  system_suffix: string;
  user_prefix: string;
  user_suffix: string;
  assistant_prefix: string;
  assistant_suffix: string;
  stop: string[];
  include_names: boolean;
  activation_regex: string;
  story_string: string;
  example_separator: string;
  chat_start: string;
  /** Keys the file holds that have no counterpart here, or whose value is too long. */
  unmapped: string[];
}

const object = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
const text = (value: unknown): string => (typeof value === 'string' ? value : '');

/** Keys SillyTavern writes that this app has no use for, or that ride with others. */
const QUIET = new Set(['name', 'wrap', 'macro', 'names', 'names_behavior']);
const INSTRUCT_KEYS: Record<string, keyof ImportedTemplate> = {
  input_sequence: 'user_prefix',
  input_suffix: 'user_suffix',
  output_sequence: 'assistant_prefix',
  output_suffix: 'assistant_suffix',
  system_sequence: 'system_prefix',
  system_suffix: 'system_suffix',
  stop_sequence: 'stop',
  activation_regex: 'activation_regex',
};
const CONTEXT_KEYS: Record<string, keyof ImportedTemplate> = {
  story_string: 'story_string',
  example_separator: 'example_separator',
  chat_start: 'chat_start',
};

function limitOf(field: keyof ImportedTemplate): number {
  if (field === 'story_string') return INSTRUCT_CUSTOM.story_characters;
  if (field === 'activation_regex') return INSTRUCT_CUSTOM.activation_regex_characters;
  if (field === 'stop') return INSTRUCT_CUSTOM.stop_characters;
  return INSTRUCT_CUSTOM.field_characters;
}

/** A SillyTavern instruct or context template file (or both) as this app's own template. */
export function templateFromSillyTavern(json: unknown): ImportedTemplate {
  const file = object(json);
  const instruct = 'instruct' in file || 'context' in file ? object(file.instruct) : file;
  const context = 'instruct' in file || 'context' in file ? object(file.context) : file;
  const result: ImportedTemplate = {
    name: (text(instruct.name) || text(context.name) || 'Imported template').slice(0, LIMITS.name_characters),
    start: '',
    system_prefix: '',
    system_suffix: '',
    user_prefix: '',
    user_suffix: '',
    assistant_prefix: '',
    assistant_suffix: '',
    stop: [],
    include_names: instruct.names === true || instruct.names_behavior === 'always' || instruct.names_behavior === 'force',
    activation_regex: '',
    story_string: '',
    example_separator: '',
    chat_start: '',
    unmapped: [],
  };
  const wrap = instruct.wrap === true;
  const take = (
    source: Record<string, unknown>,
    keys: Record<string, keyof ImportedTemplate>,
    others: ReadonlySet<string>,
  ) => {
    for (const [key, value] of Object.entries(source)) {
      const field = keys[key];
      if (field === undefined) {
        if (!QUIET.has(key) && !others.has(key)) result.unmapped.push(key);
        continue;
      }
      const raw = text(value);
      if (Array.from(raw).length > limitOf(field)) {
        result.unmapped.push(key);
        continue;
      }
      if (field === 'stop') {
        if (raw !== '') result.stop.push(raw);
        continue;
      }
      // With wrap, a sequence is followed by a line break, as SillyTavern wraps it.
      const wrapped = wrap && keys === INSTRUCT_KEYS && raw !== '' && field !== 'activation_regex' ? `${raw}\n` : raw;
      (result[field] as string) = Array.from(wrapped).slice(0, limitOf(field)).join('');
    }
  };
  const contextKeys = new Set(Object.keys(CONTEXT_KEYS));
  const instructKeys = new Set(Object.keys(INSTRUCT_KEYS));
  take(instruct, INSTRUCT_KEYS, instruct === context ? contextKeys : new Set());
  if (context !== instruct) take(context, CONTEXT_KEYS, new Set());
  else take(context, CONTEXT_KEYS, instructKeys);
  result.unmapped = [...new Set(result.unmapped)].sort();
  return result;
}
