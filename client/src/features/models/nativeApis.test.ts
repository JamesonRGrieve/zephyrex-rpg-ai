// @vitest-environment node
// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import cases from '../../../../contract/native-api-cases.json';
import {
  type NativeApi,
  nativeDelta,
  nativeModelIds,
  nativeModelsRequest,
  nativeRequest,
  openAiPayload,
} from './nativeApis';

describe('the native API cases both twins run (audit gap 8)', () => {
  it.each(cases.request_cases)('$name', ({ api, base_url: baseUrl, api_key: apiKey, body, request }) => {
    expect(nativeRequest(api as NativeApi, baseUrl, apiKey, body)).toEqual(request);
  });
  it.each(cases.delta_cases)('$name', ({ api, payload, delta }) => {
    expect(nativeDelta(api as NativeApi, payload)).toEqual(delta);
    expect(openAiPayload(api as NativeApi, payload)).toBe(delta === null ? null : JSON.stringify({ choices: [{ delta }] }));
  });
  it.each(cases.models_cases)('$name', ({ api, base_url: baseUrl, api_key: apiKey, request, answer, ids }) => {
    expect(nativeModelsRequest(api as NativeApi, baseUrl, apiKey)).toEqual(request);
    expect(nativeModelIds(api as NativeApi, answer)).toEqual(ids);
  });
});
