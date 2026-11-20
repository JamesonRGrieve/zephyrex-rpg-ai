// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Speech (A29): replies read aloud, each character in their own voice, and the composer dictated by
 * speech recognition where the device offers it. A line is read by a model set to speak when the
 * person has one (server voices, features/speech/serverVoice.ts), else by the browser's speech
 * synthesis, where nothing leaves the device. A character's voice is kept in its card's `extensions` (as SillyTavern
 * keeps extension data), so it travels with an exported card.
 */
import { SPEECH } from '~/contract';
import { splitReasoning } from '~/features/prompt/assemble';

export const VOICE_EXTENSION = 'zephyrex_rpg_voice';

export interface CharacterVoice {
  /** The browser voice's name; null for the device's default voice. */
  name: string | null;
  rate: number;
  pitch: number;
  /** The voice's name on a model set to speak (A29, server voices); null for its default voice. */
  server: string | null;
}

export const DEFAULT_VOICE: CharacterVoice = { name: null, rate: 1, pitch: 1, server: null };
export const RATE_RANGE = [0.5, 2] as const;
export const PITCH_RANGE = [0, 2] as const;

const clamp = (value: unknown, [low, high]: readonly [number, number], fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(high, Math.max(low, value)) : fallback;

/** A character's voice from its card's extensions; the defaults for anything missing or unreadable. */
export function voiceOf(extensions: Readonly<Record<string, unknown>>): CharacterVoice {
  const stored: unknown = extensions[VOICE_EXTENSION];
  const name: unknown = Reflect.get(Object(stored), 'name');
  const server: unknown = Reflect.get(Object(stored), 'server');
  return {
    name: typeof name === 'string' && name !== '' ? name : null,
    rate: clamp(Reflect.get(Object(stored), 'rate'), RATE_RANGE, DEFAULT_VOICE.rate),
    pitch: clamp(Reflect.get(Object(stored), 'pitch'), PITCH_RANGE, DEFAULT_VOICE.pitch),
    server: serverVoiceName(server),
  };
}

/** A server voice's name as typed: trimmed, null when empty, unreadable or longer than the contract allows. */
export function serverVoiceName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const name = value.trim();
  return name === '' || name.length > SPEECH.voice_characters ? null : name;
}

/** The card's extensions with `voice` set (or removed, when it is the default). */
export function withVoice(extensions: Readonly<Record<string, unknown>>, voice: CharacterVoice): Record<string, unknown> {
  const rest = Object.fromEntries(Object.entries(extensions).filter(([key]) => key !== VOICE_EXTENSION));
  const isDefault =
    voice.name === null &&
    voice.rate === DEFAULT_VOICE.rate &&
    voice.pitch === DEFAULT_VOICE.pitch &&
    voice.server === null;
  return isDefault ? rest : { ...rest, [VOICE_EXTENSION]: voice };
}

/**
 * What is read aloud of a reply: the reply without its reasoning, with the roleplay markup (the
 * asterisks around actions) taken out so the voice does not spell it.
 */
export function speakableText(text: string): string {
  return splitReasoning(text)
    .reply.replace(/\*([^*]+)\*/g, '$1')
    .replace(/[_~`#>]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Whether this browser can speak and listen. */
export function speechSupport(scope: object = globalThis): { speak: boolean; listen: boolean } {
  return {
    speak: 'speechSynthesis' in scope && 'SpeechSynthesisUtterance' in scope,
    listen: 'SpeechRecognition' in scope || 'webkitSpeechRecognition' in scope,
  };
}

/** Reads `text` aloud in `voice` (stopping whatever was being read); false when the browser cannot. */
export function speak(text: string, voice: CharacterVoice): boolean {
  if (!speechSupport().speak) return false;
  const spoken = speakableText(text);
  if (spoken === '') return false;
  const utterance = new SpeechSynthesisUtterance(spoken);
  const chosen = voice.name === null ? undefined : speechSynthesis.getVoices().find((one) => one.name === voice.name);
  if (chosen !== undefined) utterance.voice = chosen;
  utterance.rate = voice.rate;
  utterance.pitch = voice.pitch;
  speechSynthesis.cancel();
  speechSynthesis.speak(utterance);
  return true;
}

export function stopSpeaking(): void {
  if (speechSupport().speak) speechSynthesis.cancel();
}
