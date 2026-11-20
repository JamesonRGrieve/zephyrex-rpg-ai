// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { DEFAULT_VOICE, speakableText, speechSupport, VOICE_EXTENSION, voiceOf, withVoice } from './voice';

describe('character voices', () => {
  it('reads a voice from the card, the defaults for anything missing and numbers kept in range', () => {
    expect(voiceOf({})).toEqual(DEFAULT_VOICE);
    expect(voiceOf({ [VOICE_EXTENSION]: { name: 'Samantha', rate: 9, pitch: -1 } })).toEqual({
      name: 'Samantha',
      rate: 2,
      pitch: 0,
    });
    expect(voiceOf({ [VOICE_EXTENSION]: 'nonsense' })).toEqual(DEFAULT_VOICE);
  });

  it('keeps other extensions, and drops the voice when it is the default', () => {
    const set = withVoice({ depth_prompt: 1 }, { name: 'Daniel', rate: 1.2, pitch: 1 });
    expect(set).toEqual({ depth_prompt: 1, [VOICE_EXTENSION]: { name: 'Daniel', rate: 1.2, pitch: 1 } });
    expect(withVoice(set, DEFAULT_VOICE)).toEqual({ depth_prompt: 1 });
  });
});

describe('speakableText', () => {
  it('reads the reply without reasoning or markup', () => {
    expect(speakableText('<think>plan</think>*wipes her hands* "Welcome   aboard," she says.')).toBe(
      'wipes her hands "Welcome aboard," she says.',
    );
  });
});

describe('speechSupport', () => {
  it('says what the browser offers', () => {
    expect(speechSupport({})).toEqual({ speak: false, listen: false });
    expect(speechSupport({ speechSynthesis: {}, SpeechSynthesisUtterance: {}, webkitSpeechRecognition: {} })).toEqual({
      speak: true,
      listen: true,
    });
  });
});
