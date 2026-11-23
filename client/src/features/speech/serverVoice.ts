// SPDX-License-Identifier: AGPL-3.0-or-later
'use client';
/**
 * Server voices (A29): a line read aloud by a model the person set to speak, through
 * `POST /api/v1/ai_chat/speech` (lib/speech.ts in lite, the ai_chat extension in SaaS), played
 * here. Without such a model the browser reads aloud instead (voice.ts).
 */
import { csrfHeaders } from '@zephyrex/auth/lib/session';
import { type CharacterVoice, speakableText, stopSpeaking } from './voice';

export const SPEECH_PATH = '/api/v1/ai_chat/speech';

/** Whether any of the person's models is set to speak. */
export function hasVoiceModel(endpoints: readonly { roles: readonly string[] }[] | undefined): boolean {
  return (endpoints ?? []).some((endpoint) => endpoint.roles.includes('voice'));
}

/** `text` spoken in `voice` by the model set to speak: the audio as a data URL; nothing is kept. */
export async function serverSpeech(text: string, voice: CharacterVoice): Promise<string> {
  const response = await fetch(SPEECH_PATH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...csrfHeaders('POST') },
    body: JSON.stringify({ speech: { text, voice: voice.server, speed: voice.rate } }),
  });
  const body: unknown = await response.json().catch(() => null);
  const audio: unknown = Reflect.get(Object(Reflect.get(Object(body), 'speech')), 'audio');
  if (!response.ok || typeof audio !== 'string') {
    const detail: unknown = Reflect.get(Object(body), 'detail');
    const message: unknown = typeof detail === 'string' ? detail : Reflect.get(Object(detail), 'message');
    throw new Error(typeof message === 'string' ? message : `The line could not be read aloud (${response.status})`);
  }
  return audio;
}

let playing: HTMLAudioElement | null = null;

// Audio asked for ahead of time: the next part of a reading is fetched while this one plays, so parts
// follow each other without a wait between them (the operator, 2026-11-23: "The voice is also choppy").
const ahead = new Map<string, Promise<string>>();
const aheadKey = (text: string, voice: CharacterVoice) => `${voice.server ?? ''}|${voice.rate}|${text}`;

/** Starts fetching `text`'s audio now, for a part that plays next. */
export function prefetchSpeech(text: string, voice: CharacterVoice): void {
  const spoken = speakableText(text);
  if (spoken === '') return;
  const key = aheadKey(spoken, voice);
  if (!ahead.has(key))
    ahead.set(
      key,
      serverSpeech(spoken, voice).catch(() => ''),
    );
}

/** Stops a line the server is reading. */
export function stopServerSpeech(): void {
  playing?.pause();
  playing = null;
}

/**
 * Reads a reply aloud by the model set to speak (stopping whatever was being read); false when
 * there is nothing to say. Throws with the reason when the model could not.
 */
export async function speakOnServer(text: string, voice: CharacterVoice, onEnd?: () => void): Promise<boolean> {
  const spoken = speakableText(text);
  if (spoken === '') return false;
  const key = aheadKey(spoken, voice);
  const fetched = ahead.get(key);
  ahead.delete(key);
  const audio = (fetched !== undefined ? await fetched : '') || (await serverSpeech(spoken, voice));
  stopSpeaking();
  stopServerSpeech();
  playing = new Audio(audio);
  if (onEnd !== undefined) {
    // Ended, stopped (a pause) or broken: the line is over either way.
    playing.addEventListener('ended', onEnd, { once: true });
    playing.addEventListener('pause', onEnd, { once: true });
    playing.addEventListener('error', onEnd, { once: true });
  }
  await playing.play();
  return true;
}
