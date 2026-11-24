// SPDX-License-Identifier: AGPL-3.0-or-later
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CampaignEntry, confirmName } from './CampaignEntry';

const base = {
  href: '/play/chat-1',
  name: 'Brenna Ashdown',
  title: 'Clusterfuck Express',
  line: 'The party has crossed to the drowned mill.',
  updated: '2026-11-24T15:25:54Z',
};

describe('CampaignEntry', () => {
  // The operator, 2026-11-24: the character's name, then an optional title the player sets at any time.
  it('shows the character, then the title, and names it in place', async () => {
    const onRename = vi.fn();
    render(<CampaignEntry {...base} title={null} onRename={onRename} onDelete={vi.fn()} />);
    expect(screen.getByRole('link')).toHaveTextContent('Brenna Ashdown');
    await userEvent.click(screen.getByRole('button', { name: "Name Brenna Ashdown's campaign" }));
    await userEvent.type(
      screen.getByRole('textbox', { name: "Title for Brenna Ashdown's campaign" }),
      'Clusterfuck Express',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Save the title' }));
    expect(onRename).toHaveBeenCalledWith('Clusterfuck Express');
  });

  // The operator, 2026-11-24: "These absolutely must have a 'type the name of the campaign to confirm' delete box".
  it('deletes only once the campaign’s name is typed exactly', async () => {
    const onDelete = vi.fn();
    render(<CampaignEntry {...base} onRename={vi.fn()} onDelete={onDelete} />);
    await userEvent.click(screen.getByRole('button', { name: 'Delete Clusterfuck Express' }));
    const confirm = await screen.findByRole('button', { name: 'Delete' });
    expect(confirm).toBeDisabled();
    const box = screen.getByRole('textbox', { name: 'Type Clusterfuck Express to confirm' });
    await userEvent.type(box, 'Clusterfuck');
    expect(confirm).toBeDisabled();
    await userEvent.type(box, ' Express');
    expect(confirm).toBeEnabled();
    await userEvent.click(confirm);
    expect(onDelete).toHaveBeenCalledOnce();
  });

  it('keeps the campaign when the dialog is dismissed', async () => {
    const onDelete = vi.fn();
    render(<CampaignEntry {...base} title={null} onRename={vi.fn()} onDelete={onDelete} />);
    await userEvent.click(screen.getByRole('button', { name: 'Delete Brenna Ashdown' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Keep it' }));
    expect(onDelete).not.toHaveBeenCalled();
  });
});

describe('confirmName', () => {
  it('is the title when there is one, else the character', () => {
    expect(confirmName('Brenna Ashdown', 'Clusterfuck Express')).toBe('Clusterfuck Express');
    expect(confirmName('Brenna Ashdown', null)).toBe('Brenna Ashdown');
  });
});
