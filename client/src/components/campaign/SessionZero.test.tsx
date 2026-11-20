// SPDX-License-Identifier: AGPL-3.0-or-later
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SessionZero } from './SessionZero';

describe('SessionZero', () => {
  it('asks one question a screen, shows the frame, then saves it', async () => {
    const create = vi.fn(async () => ({ id: 'camp-1' }));
    const onSaved = vi.fn();
    render(<SessionZero create={create} onSaved={onSaved} />);
    expect(screen.getByText('Question 1 of 8')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Name'), 'The Kestrel');
    await userEvent.type(screen.getByLabelText('Genre'), 'Space opera');
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));

    expect(screen.getByRole('heading', { name: 'The tone' })).toHaveFocus();
    await userEvent.click(screen.getByRole('radio', { name: 'grim' }));
    for (let step = 0; step < 7; step += 1)
      await userEvent.click(screen.getByRole('button', { name: /^(Next|See the frame)$/ }));

    expect(screen.getByRole('heading', { name: 'The frame, as your players will read it' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'The Kestrel' })).toBeInTheDocument();
    expect(screen.getByText(/It feels grim/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Save the campaign' }));
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'The Kestrel', genre: 'Space opera', dials: { grim_hopeful: -1 } }),
    );
    expect(onSaved).toHaveBeenCalledWith('camp-1');
  });

  it('goes back without losing an answer', async () => {
    render(<SessionZero create={vi.fn()} onSaved={vi.fn()} />);
    await userEvent.type(screen.getByLabelText('Name'), 'K');
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByLabelText('Name')).toHaveValue('K');
  });
});
