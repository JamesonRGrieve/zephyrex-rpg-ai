// @vitest-environment node
// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { templateFromSillyTavern } from './stTemplates';

describe('a SillyTavern instruct or context template in (audit gap 4)', () => {
  it('reads an instruct template, wrapping its sequences, and says what it leaves out', () => {
    const read = templateFromSillyTavern({
      name: 'Llama 3 Instruct',
      input_sequence: '<|start_header_id|>user<|end_header_id|>',
      output_sequence: '<|start_header_id|>assistant<|end_header_id|>',
      system_sequence: '<|start_header_id|>system<|end_header_id|>',
      input_suffix: '<|eot_id|>',
      stop_sequence: '<|eot_id|>',
      wrap: true,
      names_behavior: 'always',
      activation_regex: 'llama-3',
      first_output_sequence: '',
      skip_examples: false,
    });
    expect(read).toMatchObject({
      name: 'Llama 3 Instruct',
      user_prefix: '<|start_header_id|>user<|end_header_id|>\n',
      assistant_prefix: '<|start_header_id|>assistant<|end_header_id|>\n',
      system_prefix: '<|start_header_id|>system<|end_header_id|>\n',
      user_suffix: '<|eot_id|>\n',
      stop: ['<|eot_id|>'],
      include_names: true,
      activation_regex: 'llama-3',
    });
    expect(read.unmapped).toEqual(['first_output_sequence', 'skip_examples']);
  });

  it('reads a context template, and a master export holding both', () => {
    const story = '{{#if system}}{{system}}\n{{/if}}{{description}}';
    expect(
      templateFromSillyTavern({
        name: 'Default',
        story_string: story,
        example_separator: '***',
        chat_start: '***',
        use_stop_strings: false,
      }),
    ).toMatchObject({ story_string: story, example_separator: '***', chat_start: '***', unmapped: ['use_stop_strings'] });
    const both = templateFromSillyTavern({
      instruct: { name: 'ChatML', input_sequence: '<|im_start|>user\n', names: false },
      context: { story_string: story, chat_start: '' },
    });
    expect(both).toMatchObject({
      name: 'ChatML',
      user_prefix: '<|im_start|>user\n',
      story_string: story,
      include_names: false,
    });
  });

  it('leaves out a value too long to keep, by name', () => {
    expect(templateFromSillyTavern({ input_sequence: 'x'.repeat(5000) })).toMatchObject({
      user_prefix: '',
      unmapped: ['input_sequence'],
    });
  });
});
