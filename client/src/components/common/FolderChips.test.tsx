// SPDX-License-Identifier: AGPL-3.0-or-later
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { FolderChips } from './FolderChips';

describe('FolderChips', () => {
  it('is hidden while nothing is in a folder', () => {
    const { container } = render(<FolderChips folders={[]} value={{ kind: 'all' }} onChange={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('chooses all, one folder, or none', async () => {
    const onChange = vi.fn();
    render(<FolderChips folders={['Crew', 'Villains']} value={{ kind: 'all' }} onChange={onChange} />);
    expect(screen.getByRole('radio', { name: 'All' })).toHaveAttribute('aria-checked', 'true');
    await userEvent.click(screen.getByRole('radio', { name: 'Villains' }));
    expect(onChange).toHaveBeenCalledWith({ kind: 'folder', name: 'Villains' });
    await userEvent.click(screen.getByRole('radio', { name: 'No folder' }));
    expect(onChange).toHaveBeenCalledWith({ kind: 'none' });
  });
});
