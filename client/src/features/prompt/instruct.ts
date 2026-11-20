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
