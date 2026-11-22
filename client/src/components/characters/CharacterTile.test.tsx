// SPDX-License-Identifier: AGPL-3.0-or-later
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CharacterTile, initials } from './CharacterTile';

const ADA = { id: 'c-ada', name: 'Ada Vance', avatar: null, tags: ['sci-fi'], favourite: true, description: '' };

describe('CharacterTile', () => {
  it('links to the character and shows the favourite state', async () => {
    const toggle = vi.fn();
    render(<CharacterTile character={ADA} onToggleFavourite={toggle} />);
    expect(screen.getByRole('link', { name: /Ada Vance/ })).toHaveAttribute('href', '/characters/c-ada');
    const star = screen.getByRole('button', { name: 'Unfavourite Ada Vance' });
    expect(star).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(star);
    expect(toggle).toHaveBeenCalledOnce();
  });

  it('reads its description as a chat would, with {{char}} as their name', () => {
    render(
      <CharacterTile
        character={{ ...ADA, description: '{{char}} is the engineer; {{user}} is new aboard.' }}
        onToggleFavourite={vi.fn()}
      />,
    );
    expect(screen.getByText('Ada Vance is the engineer; the player is new aboard.')).toBeInTheDocument();
  });

  it('makes initials from up to two words', () => {
    expect([initials('Ada Vance Smith'), initials('bram'), initials('  ')]).toEqual(['AV', 'B', '?']);
    expect([
      initials('The Barkeep (emerging from behind the bar)'),
      initials('Sister Maelis (Varn)'),
      initials('(x)'),
    ]).toEqual(['B', 'SM', '?']);
  });
});
