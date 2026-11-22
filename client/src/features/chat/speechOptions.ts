// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * How the seat may speak and to whom beyond the room (the operator, 2026-11-22: "The additional speech
 * modes should be setting dependent (vox / vox caster in 40k only if one is in possession and message
 * etc in DnD only if spell is known)"): the server reads the speaker's gear and spells from the VTT.
 * Null on any failure, and the composer offers the base three.
 */
import { csrfHeaders } from '@zephyrex/auth/lib/session';
import type { SpeechManner, SpeechOptions } from '~/components/play/LineQueue';

export async function fetchSpeechOptions(chatId: string, speakerId: string): Promise<SpeechOptions | null> {
  const response = await fetch('/api/v1/ai_chat/speech_options', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...csrfHeaders('POST') },
    body: JSON.stringify({ speech_options: { chat_id: chatId, speaker_id: speakerId } }),
  }).catch(() => null);
  if (response === null || !response.ok) return null;
  const answer = Object(Reflect.get(Object(await response.json().catch(() => null)), 'speech_options'));
  const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
  const manners = list(Reflect.get(answer, 'manners')).flatMap((raw): SpeechManner[] => {
    const id = Reflect.get(Object(raw), 'id');
    const label = Reflect.get(Object(raw), 'label');
    const reaches = Reflect.get(Object(raw), 'reaches');
    return typeof id === 'string' &&
      typeof label === 'string' &&
      (reaches === 'present' || reaches === 'remote' || reaches === 'broadcast')
      ? [{ id, label, reaches }]
      : [];
  });
  const remote = list(Reflect.get(answer, 'remote')).flatMap((raw) => {
    const id = Reflect.get(Object(raw), 'id');
    const name = Reflect.get(Object(raw), 'name');
    const via = Reflect.get(Object(raw), 'via');
    return typeof id === 'string' && typeof name === 'string' ? [{ id, name, via: typeof via === 'string' ? via : '' }] : [];
  });
  return { manners, remote };
}
