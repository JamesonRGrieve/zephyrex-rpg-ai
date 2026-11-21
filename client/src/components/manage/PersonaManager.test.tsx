// SPDX-License-Identifier: AGPL-3.0-or-later
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PersonaFormView } from './PersonaManager';

const CHARACTERS = [
  { id: 'c-ada', name: 'Ada' },
  { id: 'c-bram', name: 'Bram' },
];
const BOOKS = [{ id: 'b1', name: 'Sam’s past' }];

describe('PersonaFormView (audit gap 9)', () => {
  it('saves a title, a description at a depth and role, a lorebook and locks to characters', async () => {
    const onSave = vi.fn();
    render(<PersonaFormView persona={null} characterOptions={CHARACTERS} lorebookOptions={BOOKS} onSave={onSave} />);
    await userEvent.type(screen.getByLabelText('Name'), 'Sam');
    await userEvent.type(screen.getByLabelText('Title'), 'Deckhand');
    expect(screen.queryByLabelText('Messages from the end')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('radio', { name: 'In the chat, at a depth' }));
    await userEvent.clear(screen.getByLabelText('Messages from the end'));
    await userEvent.type(screen.getByLabelText('Messages from the end'), '7');
    await userEvent.click(screen.getByRole('radio', { name: 'You' }));
    await userEvent.selectOptions(screen.getByLabelText('Lorebook'), 'b1');
    await userEvent.click(screen.getByLabelText('Bram'));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Sam',
        title: 'Deckhand',
        description_position: 'depth',
        description_depth: 7,
        description_role: 'user',
        lorebook_id: 'b1',
        character_ids: ['c-bram'],
      }),
    );
  });

  it('keeps a persona in the prompt with no locks by default', async () => {
    const onSave = vi.fn();
    render(<PersonaFormView persona={null} characterOptions={[]} lorebookOptions={[]} onSave={onSave} />);
    await userEvent.type(screen.getByLabelText('Name'), 'Sam');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ description_position: 'prompt', lorebook_id: null, character_ids: [], title: '' }),
    );
  });
});
