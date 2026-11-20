// SPDX-License-Identifier: AGPL-3.0-or-later
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ContextInspector } from './ContextInspector';

const PROMPT = {
  messages: [{ role: 'system' as const, content: 'You are Bram.', tokens: 8 }],
  dropped: 0,
  tokens: 8,
  context_tokens: 1000,
  max_tokens: 200,
  active_lore: [],
};

describe('ContextInspector', () => {
  it('shows how full the window is, and says when nothing was dropped and no lore went in', () => {
    render(<ContextInspector prompt={PROMPT} />);
    expect(screen.getByText(/About 8 of 800 tokens \(1%\)/)).toBeInTheDocument();
    // By its aria-label: getByRole computes every element's accessible name, slow in jsdom.
    expect(screen.getByLabelText('1% of the window used')).toHaveAttribute('role', 'img');
    expect(screen.getByText(/Nothing was left out\. No lore entries went in\./)).toBeInTheDocument();
  });

  it('names one dropped turn and one lore entry in the singular', () => {
    render(<ContextInspector prompt={{ ...PROMPT, dropped: 1, active_lore: ['e1'] }} />);
    expect(screen.getByText(/1 older turn was left out to fit\. 1 lore entry went in\./)).toBeInTheDocument();
  });
});
