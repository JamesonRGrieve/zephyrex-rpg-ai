// SPDX-License-Identifier: AGPL-3.0-or-later
'use client';
/**
 * Dictation for the composer (A29): the browser's speech recognition, where the device has it.
 * Each finished phrase is handed to `onPhrase`; listening stops on its own after a pause.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { speechSupport } from './voice';

interface Recognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start(): void;
  stop(): void;
}

type RecognitionConstructor = new () => Recognition;

/** The finished phrases in a recognition result, from `from` on, joined. */
export function finishedText(results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>, from: number): string {
  return Array.from(results)
    .slice(from)
    .filter((result) => result.isFinal)
    .map((result) => result[0]?.transcript.trim() ?? '')
    .filter(Boolean)
    .join(' ');
}

export function useDictation(onPhrase: (text: string) => void): { supported: boolean; listening: boolean; toggle: () => void } {
  const [supported] = useState(() => speechSupport().listen);
  const [listening, setListening] = useState(false);
  const recognition = useRef<Recognition | null>(null);
  const phrase = useRef(onPhrase);
  phrase.current = onPhrase;

  useEffect(() => () => recognition.current?.stop(), []);

  const toggle = useCallback(() => {
    if (recognition.current !== null) {
      recognition.current.stop();
      return;
    }
    const Constructor = (Reflect.get(globalThis, 'SpeechRecognition') ?? Reflect.get(globalThis, 'webkitSpeechRecognition')) as RecognitionConstructor | undefined;
    if (Constructor === undefined) return;
    const listener = new Constructor();
    listener.continuous = false;
    listener.interimResults = false;
    listener.lang = typeof navigator === 'undefined' ? 'en' : navigator.language;
    listener.onresult = (event) => {
      const text = finishedText(event.results, event.resultIndex);
      if (text !== '') phrase.current(text);
    };
    const finish = () => {
      recognition.current = null;
      setListening(false);
    };
    listener.onend = finish;
    listener.onerror = finish;
    recognition.current = listener;
    setListening(true);
    listener.start();
  }, []);

  return { supported, listening, toggle };
}
