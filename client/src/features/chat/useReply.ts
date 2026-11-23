// SPDX-License-Identifier: AGPL-3.0-or-later
'use client';
/**
 * Streams a character's next reply (`POST /api/v1/ai_chat/generate`) into the page as it is
 * written, and stops it on request. The finished text is handed back for the chat to keep as a
 * message or a swipe; a stopped reply keeps what had arrived.
 */
import { csrfHeaders } from '@zephyrex/auth/lib/session';
import { useCallback, useRef, useState } from 'react';
import {
  type LiveItem,
  parseEventBlock,
  type ReformatRun,
  type ReplyEvent,
  type SavedLine,
  takeBlocks,
} from './replyStream';

export const GENERATE_PATH = '/api/v1/ai_chat/generate';
/**
 * Fully asynchronous turns (the operator, 2026-11-23: "Send makes two requests… dropping that subscription
 * has no effect on the server's work… Stop is its own request"): the turn is posted (204) and runs on the
 * server; its stream is a separate subscription, taken again from the start whenever it drops.
 */
export const TURN_PATH = '/api/v1/ai_chat/turn';
export const TURN_STREAM_PATH = '/api/v1/ai_chat/turn_stream';
export const TURN_STOP_PATH = '/api/v1/ai_chat/turn_stop';

export interface ReplyRequest {
  chat_id: string;
  leaf_id: string | null;
  speaker_id: string | null;
  /** `reply` when left out; `continue` carries on the leaf; `impersonate` writes the person's line. */
  mode?: 'reply' | 'continue' | 'impersonate' | 'table' | 'narrate';
  /** AP4: this turn asked of another of the person's models, to compare. */
  endpoint_id?: string;
  /** A second try after the voice guard caught a span (features/chat/voiceGuard.ts): it's forbidden. */
  forbid?: { names: string[]; span: string; spans?: string[]; reason?: 'canon' | 'table_voice'; note?: string };
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
  /** The reformat model's runs for a narration, when it sorted the prose (else undefined). */
  runs?: ReformatRun[];
  /** The table GM's answer was in the wrong voice (the server kept nothing): what to tell it next time. */
  voiceProblem?: string;
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

  // The chat whose turn runs on the server now, for Stop (its own request).
  const serverTurn = useRef<string | null>(null);
  const stop = useCallback(() => {
    const chatId = serverTurn.current;
    if (chatId !== null)
      void fetch(TURN_STOP_PATH, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...csrfHeaders('POST') },
        body: JSON.stringify({ turn_stop: { chat_id: chatId } }),
      }).catch(() => undefined);
    controller.current?.abort();
  }, []);

  /** What a reply's events add up to, read from the start each time (a new subscription replays all). */
  function tally() {
    const got = {
      text: '',
      dropped: 0,
      failure: null as string | null,
      items: [] as LiveItem[],
      saved: undefined as SavedLine[] | undefined,
      runs: undefined as ReformatRun[] | undefined,
      voiceProblem: undefined as string | undefined,
      done: false,
      stopped: false,
    };
    const show = () => setState({ status: 'writing', text: got.text, items: got.items });
    const take = (event: ReplyEvent) => {
      if (event.type === 'heartbeat') return;
      if (event.type === 'delta') {
        got.text += event.text;
        setState({ status: 'writing', text: got.text });
      } else if (event.type === 'done') {
        got.dropped = event.dropped;
        got.done = true;
        got.stopped = event.stopped;
      } else if (event.type === 'error') got.failure = event.detail;
      else if (event.type === 'voice_problem') got.voiceProblem = event.note || event.kind;
      else if (event.type === 'reformat') got.runs = event.reformatted && event.runs.length > 0 ? event.runs : undefined;
      else if (event.type === 'item_start') {
        got.items = [...got.items, { ...event.item, text: '', done: false }];
        show();
      } else if (event.type === 'item_text') {
        got.items = got.items.map((item) =>
          item.index === event.index ? { ...item, text: item.text + event.delta } : item,
        );
        got.text += event.delta;
        show();
      } else if (event.type === 'item_end') {
        // An item cut to nothing (the seat's) is dropped.
        got.items = got.items.flatMap((item) =>
          item.index !== event.index ? [item] : event.text === '' ? [] : [{ ...item, text: event.text, done: true }],
        );
        show();
      } else if (event.type === 'person')
        got.items = got.items.map((item) => (item.speaker === event.name ? { ...item, speaker_id: event.id } : item));
      else got.saved = event.messages;
    };
    return { got, take };
  }

  /** A stream's events into `take`, every block (a keepalive too) counted as heard. */
  async function follow(
    response: Response,
    abort: AbortController,
    first: boolean,
    take: (event: ReplyEvent) => void,
  ): Promise<void> {
    // A stream that goes quiet without closing (the local RC run, 2026-11-22: a reply stopped mid-sentence
    // and stayed "writing" for four minutes) is dropped. The first token may take a while on a long
    // prompt; after it, silence is a stall. With the server's keepalives, silence means the line is down.
    let quiet: ReturnType<typeof setTimeout> | undefined;
    const heard = (initial: boolean) => {
      clearTimeout(quiet);
      quiet = setTimeout(() => abort.abort(), initial ? FIRST_TOKEN_MS : STALL_MS);
    };
    heard(first);
    try {
      if (response.body === null) return;
      await readEvents(response.body.pipeThrough(new TextDecoderStream()).getReader(), '', (event) => {
        heard(false);
        take(event);
      });
    } finally {
      clearTimeout(quiet);
    }
  }

  const finish = (got: ReturnType<typeof tally>['got'], stopped: boolean): ReplyResult | null => {
    if (got.failure !== null && got.text === '' && got.saved === undefined) {
      setState({ status: 'failed', detail: got.failure });
      return null;
    }
    setState({ status: 'idle' });
    return {
      text: got.text,
      dropped: got.dropped,
      stopped: stopped || got.stopped,
      ...(got.saved === undefined ? {} : { saved: got.saved }),
      ...(got.runs === undefined ? {} : { runs: got.runs }),
      ...(got.voiceProblem === undefined ? {} : { voiceProblem: got.voiceProblem }),
    };
  };

  /**
   * The turn on the server: posted, then followed; a subscription that drops (a phone leaving the tab, a
   * network blip, a stall) is taken again from the start once the tab is back. Null when this server has
   * no turns (lite, or an older build): the caller streams it directly instead.
   */
  async function serverTurnOf(request: ReplyRequest): Promise<ReplyResult | null | 'unsupported'> {
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    setState({ status: 'writing', text: '' });
    const posted = await fetch(TURN_PATH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...csrfHeaders('POST') },
      body: JSON.stringify({ generate: request }),
      signal: abort.signal,
    }).catch(() => null);
    if (posted === null) {
      if (abort.signal.aborted) return finish(tally().got, true);
      setState({ status: 'failed', detail: 'The reply could not start' });
      return null;
    }
    if (posted.status === 404 || posted.status === 405) return 'unsupported';
    // 409: a turn already runs on this chat (sent from another tab, or before a reload): follow that one.
    if (!posted.ok && posted.status !== 409) {
      setState({ status: 'failed', detail: await refusal(posted) });
      return null;
    }
    serverTurn.current = request.chat_id;
    try {
      let first = true;
      let drops = 0;
      for (;;) {
        const { got, take } = tally();
        const sub = new AbortController();
        const onStop = () => sub.abort();
        abort.signal.addEventListener('abort', onStop, { once: true });
        const query = new URLSearchParams({ chat_id: request.chat_id, start: '0' });
        const response = await fetch(`${TURN_STREAM_PATH}?${query.toString()}`, {
          headers: { Accept: 'text/event-stream' },
          signal: sub.signal,
        }).catch(() => null);
        if (response !== null && response.status === 404) {
          // The turn is gone (finished long ago, or the server restarted): what the chat saved stands.
          return finish(got, false);
        }
        if (response !== null && response.ok) await follow(response, sub, first, take).catch(() => undefined);
        abort.signal.removeEventListener('abort', onStop);
        first = false;
        if (got.done) return finish(got, false);
        if (abort.signal.aborted) return finish(got, true);
        // Dropped before the end: the server's turn goes on; follow it again once the tab is back, waiting
        // longer each time the server can't be reached (1 s, 2 s, … 30 s), so a server that's down isn't hammered.
        await backInView();
        const wait = Math.min(30_000, 1000 * 2 ** drops);
        drops += 1;
        await new Promise((resolve) => setTimeout(resolve, wait));
        if (abort.signal.aborted) return finish(got, true);
      }
    } finally {
      serverTurn.current = null;
    }
  }

  async function attempt(request: ReplyRequest, again: boolean): Promise<ReplyResult | null> {
    if (again) {
      const turned = await serverTurnOf(request);
      if (turned !== 'unsupported') return turned;
    }
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
    const { got, take } = tally();
    setState({ status: 'writing', text: '' });
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
      await follow(response, abort, true, take);
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
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onHide);
    }
    return finish(got, abort.signal.aborted);
  }

  // attempt reads only setState and the controller ref, both stable: write keeps one identity.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const write = useCallback((request: ReplyRequest) => attempt(request, true), []);
  return { state, write, stop };
}
