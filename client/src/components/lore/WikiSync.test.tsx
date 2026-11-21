// SPDX-License-Identifier: AGPL-3.0-or-later
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { WikiSyncControl, syncSummary, syncedLabel } from './WikiSync';

describe('syncSummary', () => {
  it('names only what changed', () => {
    expect(syncSummary({ created: 3, updated: 0, removed: 1 })).toBe('3 added, 1 removed');
    expect(syncSummary({ created: 0, updated: 0, removed: 0 })).toBe('Already up to date');
  });
});

describe('syncedLabel', () => {
  const now = new Date('2026-11-21T12:00:00Z');
  it('says when the book last pulled', () => {
    expect(syncedLabel(null, now)).toBe('Not pulled from the wiki yet');
    expect(syncedLabel('2026-11-21T11:59:40Z', now)).toBe('Pulled from the wiki just now');
    expect(syncedLabel('2026-11-21T11:48:00Z', now)).toBe('Pulled from the wiki 12 min ago');
  });
});

describe('WikiSyncControl', () => {
  it('pulls on a press, and says why when the pull fails', async () => {
    let finish: (problem: string | null) => void = () => undefined;
    const onSync = vi.fn(() => new Promise<string | null>((resolve) => (finish = resolve)));
    render(<WikiSyncControl syncedAt={null} onSync={onSync} />);
    await userEvent.click(screen.getByRole('button', { name: 'Sync from wiki' }));
    expect(screen.getByRole('button', { name: 'Syncing…' })).toBeDisabled();
    finish('Not synced: the wiki is not reachable');
    expect(await screen.findByRole('alert')).toHaveTextContent('Not synced: the wiki is not reachable');
    expect(screen.getByRole('button', { name: 'Sync from wiki' })).toBeEnabled();
    expect(onSync).toHaveBeenCalledOnce();
  });
});
