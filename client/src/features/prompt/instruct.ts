// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Instruct templates (A17): a chat-completion message list as the one prompt string a
 * text-completion model reads, in the template's own markup (ChatML, Llama 3, Alpaca, Mistral; the
 * contract's `instruct_templates`). Pure, and held to contract/instruct-cases.json, which the SaaS
 * server's Instruct.py runs too.
 *
 * Each message is its role's prefix, its content and its role's suffix, after the template's
 * `start`. The prompt ends with the assistant's prefix, for the model to write the reply; when
 * continuing (`openLast`) a closing assistant message is left open instead, without its suffix.
 */
import { INSTRUCT_TEMPLATES, type InstructTemplateId } from '~/contract';
import type { ModelMessage } from './assemble';

/** An instruct template's markup: a built-in one's, or a person's own (A17). */
export interface InstructTemplate {
  start: string;
  system_prefix: string;
  system_suffix: string;
  user_prefix: string;
  user_suffix: string;
  assistant_prefix: string;
  assistant_suffix: string;
  stop: readonly string[];
  /** A person's own only (audit gap 4): SillyTavern's context template and Include Names. */
  include_names?: boolean;
  story_string?: string;
  example_separator?: string;
  chat_start?: string;
}

/** A built-in template by its id, or a person's own as its fields (Instruct.py template_of). */
export function templateOf(template: InstructTemplateId | InstructTemplate): InstructTemplate {
  return typeof template === 'string' ? INSTRUCT_TEMPLATES[template] : template;
}

export function renderInstruct(
  messages: readonly ModelMessage[],
  templateId: InstructTemplateId | InstructTemplate,
  openLast = false,
): string {
  const template = templateOf(templateId);
  const closing = messages.at(-1);
  const leftOpen = openLast && closing !== undefined && closing.role === 'assistant';
  const body = leftOpen ? messages.slice(0, -1) : messages;
  const text =
    template.start +
    body
      .map((message) => `${template[`${message.role}_prefix`]}${message.content}${template[`${message.role}_suffix`]}`)
      .join('');
  return leftOpen && closing !== undefined
    ? text + template.assistant_prefix + closing.content
    : text + template.assistant_prefix;
}

export function instructStops(templateId: InstructTemplateId | InstructTemplate): string[] {
  return [...templateOf(templateId).stop];
}

/**
 * A context template's story string (audit gap 4), SillyTavern's Handlebars subset: `{{#if x}}…{{/if}}`
 * keeps its text when `x` has some (innermost first), then `{{x}}` is `x`'s text. Only the story's
 * own names are filled here; `{{char}}`, `{{user}}` and the other macros are left for the macro pass.
 */
export const STORY_FIELDS = [
  'system',
  'description',
  'personality',
  'scenario',
  'persona',
  'wiBefore',
  'wiAfter',
  'loreBefore',
  'loreAfter',
  'mesExamples',
] as const;
export type StoryField = (typeof STORY_FIELDS)[number];

const IF_BLOCK = /\{\{#if\s+(\w+)\s*\}\}((?:(?!\{\{#if)[\s\S])*?)\{\{\/if\}\}/;

export function renderStoryString(story: string, values: Readonly<Partial<Record<StoryField, string>>>): string {
  const has = (name: string) =>
    (STORY_FIELDS as readonly string[]).includes(name) && (values[name as StoryField] ?? '').trim() !== '';
  let text = story;
  for (let match = IF_BLOCK.exec(text); match !== null; match = IF_BLOCK.exec(text)) {
    text =
      text.slice(0, match.index) + (has(match[1] ?? '') ? (match[2] ?? '') : '') + text.slice(match.index + match[0].length);
  }
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (whole, name: string) =>
    (STORY_FIELDS as readonly string[]).includes(name) ? (values[name as StoryField] ?? '') : whole,
  );
}

/** A person's own template as activation sees it. */
export interface ActivatedTemplate {
  id: string;
  name: string;
  activation_regex: string;
}

/**
 * The person's own template whose activation regex matches the model's name (audit gap 4), the first
 * by name; none when none does. A pattern that doesn't compile never matches.
 */
export function activeTemplate<T extends ActivatedTemplate>(model: string, templates: readonly T[]): T | null {
  const sorted = [...templates].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const template of sorted) {
    if (template.activation_regex.trim() === '') continue;
    try {
      if (new RegExp(template.activation_regex).test(model)) return template;
    } catch {
      // not a pattern: never matches
    }
  }
  return null;
}
