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
    const ids: string[] = onChange.mock.lastCall?.[0].map((section: { id: string }) => section.id);
    expect(ids.indexOf('description')).toBe(ids.indexOf('lore_before_char') - 1);
    await userEvent.click(screen.getByRole('switch', { name: 'Include Example dialogue' }));
    expect(onChange.mock.lastCall?.[0].find((section: { id: string }) => section.id === 'examples')).toMatchObject({
      enabled: false,
    });
    await userEvent.type(screen.getAllByLabelText('Max tokens')[0] as HTMLElement, '5');
    expect(onChange.mock.lastCall?.[0][0]).toMatchObject({ id: 'main', max_tokens: 5 });
  });

  it('adds a prompt of the person’s own, places it at a depth, and removes it (audit gap 3)', async () => {
    const onChange = vi.fn();
    const { rerender } = render(<PromptLayoutEditor value={[]} onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: /Add a prompt/ }));
    const added = onChange.mock.lastCall?.[0].at(-1);
    expect(added).toMatchObject({ id: 'custom:1', name: 'Prompt 1', position: 'system', enabled: true });

    rerender(<PromptLayoutEditor value={onChange.mock.lastCall?.[0]} onChange={onChange} />);
    await userEvent.selectOptions(screen.getByLabelText('Where'), 'depth');
    expect(onChange.mock.lastCall?.[0].at(-1)).toMatchObject({ id: 'custom:1', position: 'depth' });
    await userEvent.click(screen.getByRole('button', { name: 'Remove Prompt 1' }));
    expect(onChange.mock.lastCall?.[0].some((entry: { id: string }) => entry.id === 'custom:1')).toBe(false);
  });

  it('keeps "start reply with" after the order, and drops it when blank', async () => {
    const onChange = vi.fn();
    render(<PromptLayoutEditor value={[]} onChange={onChange} />);
    await userEvent.type(screen.getByLabelText('Start reply with'), 'A');
    expect(onChange.mock.lastCall?.[0].at(-1)).toEqual({ id: 'prefill', content: 'A', enabled: true });
  });
});
