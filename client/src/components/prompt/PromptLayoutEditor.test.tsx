// SPDX-License-Identifier: AGPL-3.0-or-later
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PROMPT } from '~/contract';
import { PromptLayoutEditor } from './PromptLayoutEditor';

describe('PromptLayoutEditor', () => {
  it('shows every section in the contract’s order when the layout is empty', () => {
    render(<PromptLayoutEditor value={[]} onChange={vi.fn()} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(PROMPT.sections.length);
    expect(screen.getByRole('button', { name: 'Move System prompt up' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move Post-history instructions down' })).toBeDisabled();
  });

  it('moves a section, switches one off and sets a budget', async () => {
    const onChange = vi.fn();
    render(<PromptLayoutEditor value={[]} onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: 'Move Description up' }));
    expect(onChange.mock.lastCall?.[0].slice(0, 3).map((section: { id: string }) => section.id)).toEqual(['main', 'description', 'lore_before_char']);
    await userEvent.click(screen.getByRole('switch', { name: 'Include Example dialogue' }));
    expect(onChange.mock.lastCall?.[0].find((section: { id: string }) => section.id === 'examples')).toMatchObject({ enabled: false });
    await userEvent.type(screen.getAllByLabelText('Max tokens')[0] as HTMLElement, '5');
    expect(onChange.mock.lastCall?.[0][0]).toMatchObject({ id: 'main', max_tokens: 5 });
  });
});
