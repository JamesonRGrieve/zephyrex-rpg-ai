// SPDX-License-Identifier: AGPL-3.0-or-later
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Recap } from './Recap';

describe('Recap', () => {
  it('shows the story so far, reads it aloud and hides on request', async () => {
    const onRead = vi.fn();
    const onHide = vi.fn();
    render(<Recap summary='The crew boarded the Kestrel.' onRead={onRead} onHide={onHide} />);
    expect(screen.getByRole('region', { name: 'Previously' })).toHaveTextContent('The crew boarded the Kestrel.');
    await userEvent.click(screen.getByRole('button', { name: 'Read the recap aloud' }));
    await userEvent.click(screen.getByRole('button', { name: 'Hide the recap' }));
    expect(onRead).toHaveBeenCalledTimes(1);
    expect(onHide).toHaveBeenCalledTimes(1);
  });

  it('shows nothing without a summary, and no read button where the browser cannot speak', () => {
    const { container, rerender } = render(<Recap summary='  ' onHide={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<Recap summary='So far.' onHide={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Read the recap aloud' })).not.toBeInTheDocument();
  });
});
