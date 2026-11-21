// SPDX-License-Identifier: AGPL-3.0-or-later
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ScriptPrompt } from './ScriptPrompt';

describe('ScriptPrompt', () => {
  it('answers with the text typed', async () => {
    const onAnswer = vi.fn();
    render(<ScriptPrompt prompt='Your name?' options={null} onAnswer={onAnswer} />);
    expect(screen.getByText('Your name?')).toBeInTheDocument();
    await userEvent.type(screen.getByRole('textbox', { name: 'Your answer' }), 'Ana{Enter}');
    expect(onAnswer).toHaveBeenCalledWith('Ana');
  });

  it('answers with the button chosen, or nothing when closed', async () => {
    const onAnswer = vi.fn();
    render(<ScriptPrompt prompt='What now?' options={['Fight', 'Flee']} onAnswer={onAnswer} />);
    await userEvent.click(screen.getByRole('button', { name: 'Flee' }));
    expect(onAnswer).toHaveBeenCalledWith('Flee');
    await userEvent.keyboard('{Escape}');
    expect(onAnswer).toHaveBeenLastCalledWith(null);
  });
});
