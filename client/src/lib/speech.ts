// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * `POST /v1/ai_chat/speech` (A29, server voices): a line read aloud by a model the person set to
 * speak (the `voice` role; a chat model is never asked), at its OpenAI-compatible
 * `POST /audio/speech`. The SaaS server answers the same request the same way
 * (server/extensions/ai_chat/Speech.py); both run contract/speech-cases.json.
 *
 * Request `{ "speech": { "text", "voice", "speed" } }` (`voice` null: the contract's default voice).
 * Answer `{ "speech": { "audio" } }`, the audio a data URL the browser can play; nothing is kept.
 * 409 when no model speaks, 422 for a bad request, 502 when the model fails or sends no audio.
 */
import type { NextRequest } from 'next/server';
import { ApiError, apiErrorResponse, localOwner, readJsonObject, validationError } from '@zephyrex/lite';
import { z } from 'zod';
import { SPEECH } from '~/contract';
import { endpoints } from '~/lib/rpgRecords';

const NO_QUERY = new URLSearchParams();

/** The address a server speaks at (OpenAI-compatible `POST /audio/speech`). */
export function speechUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, '').replace(/\/(chat\/)?completions$/, '')}${SPEECH.path}`;
}

export interface SpeechAsked {
  text: string;
  voice: string | null;
  speed: number;
}

/** The request for a line read aloud: the contract's default voice when none is chosen. */
export function speechBody(model: string, asked: SpeechAsked): Record<string, string | number> {
  return {
    model,
    input: asked.text,
    voice: asked.voice ?? SPEECH.default_voice,
    speed: asked.speed,
    response_format: SPEECH.format,
  };
}

/** The media type of a model's answer when it is audio, without parameters; otherwise null. */
export function audioType(contentType: string | null): string | null {
  if (contentType === null) return null;
  const media = (contentType.split(';', 1)[0] ?? '').trim().toLowerCase();
  return media.startsWith('audio/') ? media : null;
}

const speechRequest = z.object({
  text: z
    .string()
    .max(SPEECH.text_characters)
    .refine((text) => text.trim() !== '', 'There is nothing to read aloud'),
  voice: z.string().min(1).max(SPEECH.voice_characters).nullable().default(null),
  speed: z.number().min(SPEECH.speed_range[0]).max(SPEECH.speed_range[1]).default(1),
});

export async function speech(nextRequest: NextRequest): Promise<Response> {
  try {
    const owner = localOwner(nextRequest);
    const envelope = await readJsonObject(nextRequest);
    const parsed = speechRequest.safeParse(Reflect.get(envelope, 'speech'));
    if (!parsed.success) throw validationError('A speech object with text is required', 'speech');
    const speaking = (await endpoints.list(owner.id, NO_QUERY))
      .filter((row) => (endpoints.fields(row).roles as string[]).includes('voice'))
      .sort((a, b) => a.name.localeCompare(b.name));
    const row = speaking.find((one) => one.isDefault) ?? speaking[0];
    if (row === undefined) throw new ApiError(409, { message: 'Set a model to speak first', code: 'no_voice_model' });
    const answer = await fetch(speechUrl(row.baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(row.apiKey === '' ? {} : { Authorization: `Bearer ${row.apiKey}` }),
      },
      body: JSON.stringify(speechBody(row.model, parsed.data)),
      signal: nextRequest.signal,
    }).catch(() => {
      throw new ApiError(502, { message: 'The model endpoint could not be reached', code: 'model_unreachable' });
    });
    if (answer.status >= 400)
      throw new ApiError(502, { message: `The model endpoint answered ${answer.status}`, code: 'model_refused' });
    const mediaType = audioType(answer.headers.get('content-type'));
    const audio = Buffer.from(await answer.arrayBuffer());
    if (mediaType === null || audio.length === 0 || audio.length > SPEECH.audio_bytes)
      throw new ApiError(502, { message: 'The model sent no speech this app can play', code: 'model_refused' });
    return Response.json({ speech: { audio: `data:${mediaType};base64,${audio.toString('base64')}` } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
