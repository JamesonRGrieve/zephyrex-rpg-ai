// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Tool calling for models that support it (A46), over OpenAI-compatible `tool_calls`. A streamed
 * reply's calls arrive in pieces by index and are put together in index order; each is checked
 * against the tools the request offered (a name not offered, or arguments that aren't a JSON
 * object, is refused and never run: a model chooses only from the options it was given); the
 * follow-up turn names the calls, then gives each its result or refusal. The server twin is
 * server/extensions/ai_chat/ToolCalls.py; both run contract/tool-cases.json.
 */
import cases from '../../../../contract/tool-cases.json';

/** One streamed piece of a tool call: the first for an index names it, the rest add arguments. */
export interface ToolCallChunk {
  index: number;
  id?: string;
  name?: string;
  arguments?: string;
}

export interface ToolCall {
  id: string;
  name: string;
  /** The arguments as the model wrote them: JSON text, checked before anything runs. */
  arguments: string;
}

export type Refusal = keyof typeof cases.refusals;

export type CheckedCall =
  { id: string; name: string; args: Record<string, unknown> } | { id: string; name: string; refused: Refusal };

export const REFUSALS: Readonly<Record<Refusal, string>> = cases.refusals;

/** The whole calls a stream's pieces make, in index order. */
export function assembleToolCalls(chunks: readonly ToolCallChunk[]): ToolCall[] {
  const byIndex = new Map<number, ToolCall>();
  for (const chunk of chunks) {
    const call = byIndex.get(chunk.index) ?? { id: '', name: '', arguments: '' };
    if (chunk.id !== undefined && chunk.id !== '') call.id = chunk.id;
    if (chunk.name !== undefined && chunk.name !== '') call.name = chunk.name;
    call.arguments += chunk.arguments ?? '';
    byIndex.set(chunk.index, call);
  }
  return [...byIndex.entries()].sort(([a], [b]) => a - b).map(([, call]) => call);
}

function argumentsOf(text: string): Record<string, unknown> | null {
  if (text.trim() === '') return {};
  try {
    const parsed: unknown = JSON.parse(text);
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** Each call checked against the tools offered: runnable with its arguments, or refused. */
export function checkToolCalls(calls: readonly ToolCall[], offered: readonly string[]): CheckedCall[] {
  return calls.map((call) => {
    if (!offered.includes(call.name)) return { id: call.id, name: call.name, refused: 'not_offered' };
    const args = argumentsOf(call.arguments);
    return args === null
      ? { id: call.id, name: call.name, refused: 'bad_arguments' }
      : { id: call.id, name: call.name, args };
  });
}

export type FollowUpMessage =
  | {
      role: 'assistant';
      content: null;
      tool_calls: { id: string; type: 'function'; function: { name: string; arguments: string } }[];
    }
  | { role: 'tool'; tool_call_id: string; content: string };

/** The turn that goes back to the model: the calls, then each one's result or refusal, in order. */
export function toolFollowUp(
  calls: readonly ToolCall[],
  results: Readonly<Record<string, string>>,
  refused: Readonly<Record<string, Refusal>>,
): FollowUpMessage[] {
  return [
    {
      role: 'assistant',
      content: null,
      tool_calls: calls.map((call) => ({
        id: call.id,
        type: 'function',
        function: { name: call.name, arguments: call.arguments },
      })),
    },
    ...calls.map((call): FollowUpMessage => {
      const refusal = refused[call.id];
      return {
        role: 'tool',
        tool_call_id: call.id,
        content: refusal === undefined ? (results[call.id] ?? '') : REFUSALS[refusal],
      };
    }),
  ];
}
