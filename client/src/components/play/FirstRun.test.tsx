// SPDX-License-Identifier: AGPL-3.0-or-later
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { FirstRun } from './FirstRun';

describe('FirstRun', () => {
  it('starts with a model, and a chat waits for a character', () => {
    render(<FirstRun hasModel={false} hasCharacter={false} onNewChat={vi.fn()} />);
    const steps = within(screen.getByRole('list')).getAllByRole('listitem');
    expect(steps.map((step) => step.querySelector('p')?.textContent)).toEqual([
      'Add a model',
      'Make or import a character',
      'Start a chat',
    ]);
    expect(screen.getByRole('link', { name: 'Models' })).toHaveAttribute('href', '/models');
    expect(screen.getByRole('button', { name: 'New chat' })).toBeDisabled();
  });

  it('marks what is done and opens the picker when a character exists', async () => {
    const onNewChat = vi.fn();
    render(<FirstRun hasModel hasCharacter onNewChat={onNewChat} />);
    expect(screen.getByText('Add a model', { exact: false })).toHaveTextContent('Add a model (done)');
    await userEvent.click(screen.getByRole('button', { name: 'New chat' }));
    expect(onNewChat).toHaveBeenCalledOnce();
  });
});
