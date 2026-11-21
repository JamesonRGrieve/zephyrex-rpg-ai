// SPDX-License-Identifier: AGPL-3.0-or-later
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const post = vi.fn();
const capabilities = { world: true };
vi.mock('zephyrex', async (importOriginal) => ({
  ...(await importOriginal<typeof import('zephyrex')>()),
  useClient: () => ({ post }),
}));
vi.mock('zephyrex/hooks/useToast', () => ({ notify: vi.fn() }));
vi.mock('~/features/capabilities', () => ({ useCapabilities: () => capabilities }));

const { endedNotice, useEndSession } = await import('./useEndSession');
const { notify } = await import('zephyrex/hooks/useToast');

beforeEach(() => {
  post.mockReset();
  capabilities.world = true;
});

describe('endedNotice', () => {
  it('counts the pages the report links', () => {
    expect(endedNotice(0)).toBe('The report is in the campaign log.');
    expect(endedNotice(1)).toBe('The report is in the campaign log, linked to 1 page it names.');
    expect(endedNotice(3)).toBe('The report is in the campaign log, linked to 3 pages it names.');
  });
});

describe('useEndSession', () => {
  it('is offered only with the world loaded and a campaign frame', () => {
    expect(renderHook(() => useEndSession({ id: 'c', campaign_id: 'f' })).result.current.available).toBe(true);
    expect(renderHook(() => useEndSession({ id: 'c', campaign_id: null })).result.current.available).toBe(false);
    capabilities.world = false;
    expect(renderHook(() => useEndSession({ id: 'c', campaign_id: 'f' })).result.current.available).toBe(false);
  });

  it('asks the server to end the session and says what was written', async () => {
    post.mockResolvedValue({ report_id: 'j1', title: 'Night watch: 2026-11-21', mentions: 2 });
    const { result } = renderHook(() => useEndSession({ id: 'chat-1', campaign_id: 'f' }));
    await act(() => result.current.end());
    expect(post).toHaveBeenCalledWith('/v1/session_end', { session_end: { chat_id: 'chat-1' } });
    expect(notify).toHaveBeenCalledWith('Session ended', 'The report is in the campaign log, linked to 2 pages it names.');
    expect(result.current.problem).toBeNull();
  });

  it('keeps the reason when the report could not be written', async () => {
    post.mockRejectedValue(new Error('Link this chat’s campaign to a wiki campaign first'));
    const { result } = renderHook(() => useEndSession({ id: 'chat-1', campaign_id: 'f' }));
    await act(() => result.current.end());
    // The server's own reason, as writeProblem gives it, so the person knows what to do next.
    expect(result.current.problem).toContain('Link this chat’s campaign to a wiki campaign first');
    expect(result.current.ending).toBe(false);
  });
});
