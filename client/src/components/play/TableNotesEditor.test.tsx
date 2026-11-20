// SPDX-License-Identifier: AGPL-3.0-or-later
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TableNotesEditor } from './TableNotesEditor';

describe('TableNotesEditor', () => {
  it('adds a note of the chosen kind, and removes one', async () => {
    const onChange = vi.fn();
    const { rerender } = render(<TableNotesEditor value={[]} onChange={onChange} />);
    await userEvent.selectOptions(screen.getByLabelText('Kind of note'), 'pacing');
    await userEvent.type(screen.getByLabelText('New table note'), ' Keep scenes short {Enter}');
    expect(onChange).toHaveBeenLastCalledWith([{ kind: 'pacing', text: 'Keep scenes short' }]);
    rerender(<TableNotesEditor value={[{ kind: 'pacing', text: 'Keep scenes short' }]} onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: 'Remove Pacing: Keep scenes short' }));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });
});
