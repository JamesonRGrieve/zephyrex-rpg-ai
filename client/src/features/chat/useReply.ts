// SPDX-License-Identifier: AGPL-3.0-or-later
'use client';
/**
 * Streams a character's next reply (`POST /api/v1/ai_chat/generate`) into the page as it is
 * written, and stops it on request. The finished text is handed back for the chat to keep as a
 * message or a swipe; a stopped reply keeps what had arrived.
 */
import { csrfHeaders } from '@zephyrex/auth/lib/session';
import { useCallback, useRef, useState } from 'react';
import { type LiveItem, parseEventBlock, type ReplyEvent, type SavedLine, takeBlocks } from './replyStream';

export const GENERATE_PATH = '/api/v1/ai_chat/generate';

export interface ReplyRequest {
  chat_id: string;
  leaf_id: string | null;
  speaker_id: string | null;
  /** `reply` when left out; `continue` carries on the leaf; `impersonate` writes the person's line. */
  mode?: 'reply' | 'continue' | 'impersonate' | 'table' | 'narrate';
  /** AP4: this turn asked of another of the person's models, to compare. */
  endpoint_id?: string;
  /** A second try after the voice guard caught a span (features/chat/voiceGuard.ts): it's forbidden. */
  forbid?: { names: string[]; span: string; spans?: string[]; reason?: 'canon'; note?: string };
  /** A narration that may give the party and the people present their moments (no decision came). */
  narrate_wide?: boolean;
  /** Schema-constrained lines (docs/DESIGN.md, Structured lines): the server splits and saves them. */
  structured?: boolean;
}

export interface ReplyResult {
  text: string;
  /** History turns the window left out. */
  dropped: number;
  stopped: boolean;
  /** A structured turn: the messages the server saved, each speaker's run its own (else undefined). */
  saved?: SavedLine[];
}

export type ReplyState =
  | { status: 'idle' }
  | { status: 'writing'; text: string; items?: readonly LiveItem[] }
  | { status: 'failed'; detail: string };

async function readEvents(
  reader: ReadableStreamDefaultReader<string>,
  carried: string,
  onEvent: (event: ReplyEvent) => void,
): Promise<void> {
  const { done, value } = await reader.read();
  const { blocks, rest } = takeBlocks(carried + (done ? '\n\n' : value));
  for (const block of blocks) {
    const event = parseEventBlock(block);
    if (event !== null) onEvent(event);
  }
  if (!done) await readEvents(reader, rest, onEvent);
}

/** The refusal's message, from the framework's error body. */
async function refusal(response: Response): Promise<string> {
  const body: unknown = await response.json().catch(() => null);
  const detail: unknown = Reflect.get(Object(body), 'detail');
  const message: unknown = typeof detail === 'string' ? detail : Reflect.get(Object(detail), 'message');
  return typeof message === 'string' ? message : `The reply could not start (${response.status})`;
}

/** How long a reply may take to start, and how long it may then go quiet, before it ends with what it has. */
const FIRST_TOKEN_MS = 180_000;
const STALL_MS = 60_000;

/** Resolves once the tab is visible again (and the network has had a moment to come back). */
function backInView(): Promise<void> {
  return new Promise((resolve) => {
    const settle = () => window.setTimeout(resolve, 1500);
    if (document.visibilityState === 'visible') return settle();
    const onShow = () => {
      if (document.visibilityState !== 'visible') return;
      document.removeEventListener('visibilitychange', onShow);
      settle();
    };
    document.addEventListener('visibilitychange', onShow);
  });
}

export function useReply(): { state: ReplyState; write(request: ReplyRequest): Promise<ReplyResult | null>; stop(): void } {
  const [state, setState] = useState<ReplyState>({ status: 'idle' });
  const controller = useRef<AbortController | null>(null);

  const stop = useCallback(() => controller.current?.abort(), []);

  async function attempt(request: ReplyRequest, again: boolean): Promise<ReplyResult | null> {
    controller.current?.abort();
    // A phone that leaves the tab suspends it and the stream dies with it (the operator, 2026-11-22: "When
    // I switch tabs and come back to chat in progress I get a NetworkError"): noted, so the reply is asked
    // for once more when the tab is back, and the round goes on.
    let left = typeof document !== 'undefined' && document.visibilityState === 'hidden';
    const onHide = () => {
      if (document.visibilityState === 'hidden') left = true;
    };
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onHide);
    const abort = new AbortController();
    controller.current = abort;
    let text = '';
    let dropped = 0;
    let failure: string | null = null;
    let items: LiveItem[] = [];
    let saved: SavedLine[] | undefined;
    setState({ status: 'writing', text });
    const show = () => setState({ status: 'writing', text, items });
    // A stream that goes quiet without closing (the local RC run, 2026-11-22: a reply stopped mid-sentence
    // and stayed "writing" for four minutes) ends with what it has: the round keeps its last complete
    // sentence and goes on. The first token may take a while on a long prompt; after it, silence is a stall.
    let quiet: ReturnType<typeof setTimeout> | undefined;
    const heard = (first: boolean) => {
      clearTimeout(quiet);
      quiet = setTimeout(() => abort.abort(), first ? FIRST_TOKEN_MS : STALL_MS);
    };
    heard(true);
    try {
      const response = await fetch(GENERATE_PATH, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...csrfHeaders('POST') },
        body: JSON.stringify({ generate: request }),
        signal: abort.signal,
      });
      if (!response.ok || response.body === null) {
        setState({ status: 'failed', detail: await refusal(response) });
        return null;
      }
      await readEvents(response.body.pipeThrough(new TextDecoderStream()).getReader(), '', (event) => {
        heard(false);
        if (event.type === 'delta') {
          text += event.text;
          setState({ status: 'writing', text });
        } else if (event.type === 'done') dropped = event.dropped;
        else if (event.type === 'error') failure = event.detail;
        else if (event.type === 'item_start') {
          items = [...items, { ...event.item, text: '', done: false }];
          show();
        } else if (event.type === 'item_text') {
          items = items.map((item) => (item.index === event.index ? { ...item, text: item.text + event.delta } : item));
          text += event.delta;
          show();
        } else if (event.type === 'item_end') {
          // An item cut to nothing (the seat's) is dropped.
          items = items.flatMap((item) =>
            item.index !== event.index ? [item] : event.text === '' ? [] : [{ ...item, text: event.text, done: true }],
          );
          show();
        } else if (event.type === 'person')
          items = items.map((item) => (item.speaker === event.name ? { ...item, speaker_id: event.id } : item));
        else saved = event.messages;
      });
    } catch {
      if (!abort.signal.aborted) {
        document.removeEventListener('visibilitychange', onHide);
        if (left && again) {
          await backInView();
          if (!abort.signal.aborted) return attempt(request, false);
        }
        setState({ status: 'failed', detail: 'The reply was cut off' });
        return null;
      }
    } finally {
      clearTimeout(quiet);
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onHide);
    }
    if (failure !== null && text === '' && saved === undefined) {
      setState({ status: 'failed', detail: failure });
      return null;
    }
    setState({ status: 'idle' });
    return { text, dropped, stopped: abort.signal.aborted, ...(saved === undefined ? {} : { saved }) };
  }

  // attempt reads only setState and the controller ref, both stable: write keeps one identity.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const write = useCallback((request: ReplyRequest) => attempt(request, true), []);
  return { state, write, stop };
}
