// @vitest-environment node
// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import cases from '../../../../contract/memory-cases.json';
import {
  embeddingsBody,
  embeddingsUrl,
  memoryChunks,
  memoryQuery,
  memoryText,
  recall,
  storyLines,
  vectorsOf,
} from './memory';

describe('the memory cases both twins run (A19)', () => {
  it.each(cases.chunk_cases)('$name', ({ lines, chunks }) => {
    expect(memoryChunks(lines)).toEqual(chunks);
  });
  it.each(cases.query_cases)('$name', ({ lines, query }) => {
    expect(memoryQuery(lines)).toBe(query);
  });
  it.each(cases.recall_cases)('$name', ({ query, remembered, recalled }) => {
    expect(recall(query, remembered)).toEqual(recalled);
  });
  it.each(cases.text_cases)('$name', ({ recalled, text }) => {
    expect(memoryText(recalled)).toBe(text);
  });
  it.each(cases.url_cases)('$name', ({ base_url: baseUrl, url }) => {
    expect(embeddingsUrl(baseUrl)).toBe(url);
  });
  it.each(cases.body_cases)('$name', ({ model, inputs, body }) => {
    expect(embeddingsBody(model, inputs)).toEqual(body);
  });
  it.each(cases.vector_cases)('$name', ({ answer, count, vectors }) => {
    expect(vectorsOf(answer, count)).toEqual(vectors);
  });
});

describe('the lines a chat remembers (A19)', () => {
  it.each(cases.line_cases)('$name', ({ turns, user_name: userName, names, lines }) => {
    expect(storyLines(turns, userName, new Map(Object.entries(names)))).toEqual(lines);
  });
});
