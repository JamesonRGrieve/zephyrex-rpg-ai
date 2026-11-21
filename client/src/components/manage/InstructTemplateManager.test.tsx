// SPDX-License-Identifier: AGPL-3.0-or-later
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { InstructTemplateFormView, stopLines } from './InstructTemplateManager';

describe('InstructTemplateFormView', () => {
  it('saves the markup and the stop strings, one per line', async () => {
    const onSave = vi.fn(async () => true);
    const done = vi.fn();
    render(<InstructTemplateFormView template={null} onSave={onSave} done={done} />);
    await userEvent.type(screen.getByLabelText('Name'), 'Bracketed');
    // `[[` types a literal bracket (`[` starts a key name in userEvent).
    await userEvent.type(screen.getByLabelText('Before your message'), '[[ME] ');
    await userEvent.type(screen.getByLabelText('Stop strings'), '[[ME]{Enter}{Enter}</s>');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Bracketed', user_prefix: '[ME] ', stop: ['[ME]', '</s>'] }),
    );
    expect(done).toHaveBeenCalled();
  });

  it('stays open when the save fails', async () => {
    const done = vi.fn();
    render(<InstructTemplateFormView template={null} onSave={async () => false} done={done} />);
    await userEvent.type(screen.getByLabelText('Name'), 'X');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(done).not.toHaveBeenCalled();
  });
});

describe('stopLines', () => {
  it('drops empty lines and keeps spaces', () => {
    expect(stopLines('a\n\n b\n')).toEqual(['a', ' b']);
  });

  it('saves the context template and names every turn (audit gap 4)', async () => {
    const onSave = vi.fn(async () => true);
    render(<InstructTemplateFormView template={null} onSave={onSave} done={vi.fn()} />);
    await userEvent.type(screen.getByLabelText('Name'), 'Llama');
    await userEvent.click(screen.getByLabelText('Name every turn'));
    await userEvent.type(screen.getByLabelText('Use for models matching'), 'llama-3');
    await userEvent.type(screen.getByLabelText('Chat start'), '***');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ include_names: true, activation_regex: 'llama-3', chat_start: '***', story_string: '' }),
    );
  });

  it('reads in a SillyTavern instruct template and names what didn’t come', async () => {
    render(<InstructTemplateFormView template={null} onSave={vi.fn(async () => true)} done={vi.fn()} />);
    const file = new File(
      [JSON.stringify({ name: 'Alpaca', input_sequence: '### Instruction:', wrap: true, skip_examples: true })],
      'alpaca.json',
      {
        type: 'application/json',
      },
    );
    await userEvent.upload(screen.getByLabelText('Read in a SillyTavern template'), file);
    expect(await screen.findByText(/Not brought over: skip_examples/)).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toHaveValue('Alpaca');
    expect(screen.getByLabelText('Before your message')).toHaveValue('### Instruction:\n');
  });
});
