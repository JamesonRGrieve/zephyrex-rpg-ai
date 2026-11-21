// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Extra request fields per endpoint (SillyTavern's "additional parameters"): a JSON object merged
 * into every request body sent to that endpoint, after the app's own fields. It can set what the app
 * doesn't send (`reasoning_effort: "none"`, say, to stop a model thinking) or override a sampler; it
 * never replaces the fields that carry the conversation (the contract's `reserved`). Pure, and held
 * to contract/extra-body-cases.json, which the SaaS server's ExtraBody.py runs too.
 */
import { EXTRA_BODY } from '~/contract';

export type ExtraBody = Readonly<Record<string, unknown>>;

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Why `value` can't be kept as an endpoint's extra fields, or null. */
export function extraBodyProblem(value: unknown): string | null {
  if (!isObject(value)) return 'Extra request fields are a JSON object';
  const keys = Object.keys(value);
  if (keys.length > EXTRA_BODY.max_keys) return `Extra request fields hold at most ${EXTRA_BODY.max_keys} fields`;
  const reserved = keys.filter((key) => (EXTRA_BODY.reserved as readonly string[]).includes(key));
  if (reserved.length > 0) return `Extra request fields can't set ${reserved.join(', ')}`;
  if (new TextEncoder().encode(JSON.stringify(value)).length > EXTRA_BODY.max_bytes)
    return `Extra request fields are at most ${EXTRA_BODY.max_bytes} bytes`;
  return null;
}

/** The request body with the endpoint's extra fields merged in, never over the reserved ones. */
export function withExtraBody<B extends Record<string, unknown>>(body: B, extra: ExtraBody | null | undefined): B {
  if (extra === null || extra === undefined) return body;
  const merged: Record<string, unknown> = { ...body };
  for (const [key, value] of Object.entries(extra)) {
    if (!(EXTRA_BODY.reserved as readonly string[]).includes(key)) merged[key] = value;
  }
  return merged as B;
}

/** The text a person typed in the endpoint form, read as extra fields: the object, or why not. */
export function readExtraBody(text: string): { value: Record<string, unknown> } | { problem: string } {
  if (text.trim() === '') return { value: {} };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { problem: 'Extra request fields must be valid JSON' };
  }
  const problem = extraBodyProblem(parsed);
  return problem === null ? { value: parsed as Record<string, unknown> } : { problem };
}

/** An endpoint's stored extra fields (a JSON column) as an object; none when unreadable. */
export function storedExtraBody(stored: string | null | undefined): ExtraBody {
  if (stored === null || stored === undefined || stored === '') return {};
  try {
    const value: unknown = JSON.parse(stored);
    return isObject(value) ? value : {};
  } catch {
    return {};
  }
}
