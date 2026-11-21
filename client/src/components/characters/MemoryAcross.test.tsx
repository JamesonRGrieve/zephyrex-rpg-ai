// SPDX-License-Identifier: AGPL-3.0-or-later
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MemoryAcross } from './MemoryAcross';

describe('MemoryAcross (AP8)', () => {
  it('turns the memory across chats on and off, and says what it does', () => {
    const onChange = vi.fn();
    const { rerender } = render(<MemoryAcross name='Ada' value={false} onChange={onChange} />);
    const toggle = screen.getByRole('switch', { name: 'Remember across chats' });
    expect(toggle).toHaveAccessibleDescription(/Ada may recall what happened in your other chats together/);
    fireEvent.click(toggle);
    expect(onChange).toHaveBeenLastCalledWith(true);

    rerender(<MemoryAcross name='Ada' value onChange={onChange} />);
    fireEvent.click(screen.getByRole('switch', { name: 'Remember across chats' }));
    expect(onChange).toHaveBeenLastCalledWith(false);
  });
});
