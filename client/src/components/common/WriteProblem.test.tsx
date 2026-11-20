// SPDX-License-Identifier: AGPL-3.0-or-later
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { WriteProblem } from './WriteProblem';

describe('WriteProblem', () => {
  it('announces the reason as an alert, and shows nothing without one', () => {
    const { rerender } = render(<WriteProblem problem='Name is required' />);
    expect(screen.getByRole('alert')).toHaveTextContent('Name is required');
    rerender(<WriteProblem problem={null} />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
