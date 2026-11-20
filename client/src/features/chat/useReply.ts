// SPDX-License-Identifier: AGPL-3.0-or-later
'use client';
/**
 * Streams a character's next reply (`POST /api/v1/ai_chat/generate`) into the page as it is
 * written, and stops it on request. The finished text is handed back for the chat to keep as a
 * message or a swipe; a stopped reply keeps what had arrived.
 */
import { csrfHeaders } from '@zephyrex/auth/lib/session';
import { useCallback, useRef, useState } from 'react';
import { parseEventBlock, type ReplyEvent, takeBlocks } from './replyStream';

export const GENERATE_PATH = '/api/v1/ai_chat/generate';

export interface ReplyRequest {
  chat_id: string;
  leaf_id: string | null;
  speaker_id: string | null;
  /** `reply` when left out; `continue` carries on the leaf; `impersonate` writes the person's line. */
  mode?: 'reply' | 'continue' | 'impersonate' | 'table' | 'narrate';
  /** AP4: this turn asked of another of the person's models, to compare. */
  endpoint_id?: string;
}

export interface ReplyResult {
  text: string;
  /** History turns the window left out. */
  dropped: number;
  stopped: boolean;
}

export type ReplyState = { status: 'idle' } | { status: 'writing'; text: string } | { status: 'failed'; detail: string };

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

export function useReply(): { state: ReplyState; write(request: ReplyRequest): Promise<ReplyResult | null>; stop(): void } {
  const [state, setState] = useState<ReplyState>({ status: 'idle' });
  const controller = useRef<AbortController | null>(null);

  const stop = useCallback(() => controller.current?.abort(), []);

  const write = useCallback(async (request: ReplyRequest): Promise<ReplyResult | null> => {
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    let text = '';
    let dropped = 0;
    let failure: string | null = null;
    setState({ status: 'writing', text });
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
        if (event.type === 'delta') {
          text += event.text;
          setState({ status: 'writing', text });
        } else if (event.type === 'done') dropped = event.dropped;
        else failure = event.detail;
      });
    } catch {
      if (!abort.signal.aborted) {
        setState({ status: 'failed', detail: 'The reply was cut off' });
        return null;
      }
    }
    if (failure !== null && text === '') {
      setState({ status: 'failed', detail: failure });
      return null;
    }
    setState({ status: 'idle' });
    return { text, dropped, stopped: abort.signal.aborted };
  }, []);

  return { state, write, stop };
}
