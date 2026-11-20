// SPDX-License-Identifier: AGPL-3.0-or-later
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Landing } from './Landing';

describe('Landing', () => {
  it('has one h1, the features, the comparison and the way in', () => {
    render(<Landing />);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('region', { name: 'What it does' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'SillyTavern' })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Start playing' })[0]).toHaveAttribute('href', '/play');
  });
});
