// SPDX-License-Identifier: AGPL-3.0-or-later
import { afterEach, describe, expect, it, vi } from 'vitest';
import { hasVoiceModel, SPEECH_PATH, serverSpeech, speakOnServer, stopServerSpeech } from './serverVoice';
import { DEFAULT_VOICE } from './voice';

const answer = (status: number, body: unknown) =>
  vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));

afterEach(() => {
  stopServerSpeech();
  vi.unstubAllGlobals();
});

describe('server voices (A29)', () => {
  it('knows whether a model is set to speak', () => {
    expect(hasVoiceModel(undefined)).toBe(false);
    expect(hasVoiceModel([{ roles: ['story'] }])).toBe(false);
    expect(hasVoiceModel([{ roles: ['story'] }, { roles: ['voice'] }])).toBe(true);
  });

  it('asks for the line in the character’s server voice and speed', async () => {
    const fetched = answer(200, { speech: { audio: 'data:audio/mpeg;base64,SUQz' } });
    vi.stubGlobal('fetch', fetched);
    await expect(serverSpeech('Hello.', { ...DEFAULT_VOICE, server: 'onyx', rate: 1.5 })).resolves.toBe(
      'data:audio/mpeg;base64,SUQz',
    );
    const [path, init] = fetched.mock.calls[0] as [string, RequestInit];
    expect(path).toBe(SPEECH_PATH);
    expect(JSON.parse(init.body as string)).toEqual({ speech: { text: 'Hello.', voice: 'onyx', speed: 1.5 } });
  });

  it('says why a line could not be read', async () => {
    vi.stubGlobal('fetch', answer(409, { detail: { message: 'Set a model to speak first', code: 'no_voice_model' } }));
    await expect(serverSpeech('Hello.', DEFAULT_VOICE)).rejects.toThrow('Set a model to speak first');
    vi.stubGlobal('fetch', answer(500, null));
    await expect(serverSpeech('Hello.', DEFAULT_VOICE)).rejects.toThrow('could not be read aloud (500)');
  });

  it('plays the reply without its markup, and says nothing for an empty one', async () => {
    const fetched = answer(200, { speech: { audio: 'data:audio/mpeg;base64,SUQz' } });
    vi.stubGlobal('fetch', fetched);
    const played: string[] = [];
    vi.stubGlobal(
      'Audio',
      class {
        constructor(readonly src: string) {}
        play = vi.fn().mockImplementation(() => {
          played.push(this.src);
          return Promise.resolve();
        });
        pause = vi.fn();
      },
    );
    await expect(speakOnServer('<think>hm</think>*nods* Aye.', DEFAULT_VOICE)).resolves.toBe(true);
    expect(JSON.parse((fetched.mock.calls[0] as [string, RequestInit])[1].body as string)).toMatchObject({
      speech: { text: 'nods Aye.' },
    });
    expect(played).toEqual(['data:audio/mpeg;base64,SUQz']);
    await expect(speakOnServer('<think>only thoughts</think>', DEFAULT_VOICE)).resolves.toBe(false);
    expect(fetched).toHaveBeenCalledTimes(1);
  });
});
