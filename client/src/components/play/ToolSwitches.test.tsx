// SPDX-License-Identifier: AGPL-3.0-or-later
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { type ChatTool, ToolSwitches } from './ToolSwitches';

const TOOLS: ChatTool[] = [
  { name: 'web_search', label: 'Web search', hint: 'Looks things up on the web', unavailable: null },
  { name: 'roll', label: 'Dice', hint: 'Rolls through the VTT', unavailable: 'Needs the VTT' },
];

describe('ToolSwitches', () => {
  it('shows every tool on unless switched off, and switches one off and on', async () => {
    const onChange = vi.fn();
    const { rerender } = render(<ToolSwitches tools={TOOLS} off={[]} onChange={onChange} />);
    const search = screen.getByRole('switch', { name: 'Web search' });
    expect(search).toBeChecked();
    expect(search).toHaveAccessibleDescription('Looks things up on the web');
    await userEvent.click(search);
    expect(onChange).toHaveBeenLastCalledWith(['web_search']);
    rerender(<ToolSwitches tools={TOOLS} off={['web_search']} onChange={onChange} />);
    await userEvent.click(screen.getByRole('switch', { name: 'Web search' }));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  it('shows a tool the install lacks as off, with why, and never switchable', () => {
    render(<ToolSwitches tools={TOOLS} off={[]} onChange={vi.fn()} />);
    const dice = screen.getByRole('switch', { name: 'Dice' });
    expect(dice).not.toBeChecked();
    expect(dice).toBeDisabled();
    expect(dice).toHaveAccessibleDescription('Needs the VTT');
  });
});
