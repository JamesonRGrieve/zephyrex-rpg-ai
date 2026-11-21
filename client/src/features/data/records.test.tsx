// SPDX-License-Identifier: AGPL-3.0-or-later
import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

const list = vi.fn(async () => [{ id: 'e1', created_at: null, updated_at: null }]);
vi.mock('zephyrex', () => ({ useClient: () => ({ list }) }));

const { resource } = await import('./records');

const rows = resource('lorebook_entry', 'lorebook_entries', z.object({ id: z.string() }).passthrough() as never);

describe('a filtered list', () => {
  it('sends its filter as the pager’s params, never inside the path', async () => {
    const { result } = renderHook(() => rows.useList({ lorebook_id: 'book-1' }));
    await waitFor(() => expect(result.current.data).toHaveLength(1));
    // In the path, the pager's own `?offset=…` made `lorebook_id=book-1?offset=0` and matched nothing.
    expect(list).toHaveBeenCalledWith('/v1/lorebook_entry', 'lorebook_entries', expect.anything(), {
      lorebook_id: 'book-1',
    });
  });

  it('sends no params for an unfiltered list', async () => {
    list.mockClear();
    const { result } = renderHook(() => rows.useList());
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(list).toHaveBeenCalledWith('/v1/lorebook_entry', 'lorebook_entries', expect.anything(), {});
  });
});
