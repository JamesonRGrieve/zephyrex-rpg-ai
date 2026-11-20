// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Fenced code in a message (A55): the text in its prose and ```fenced``` parts, and the sandbox
 * document a JavaScript block runs in when the person asks. The code never runs in the app's own
 * origin: an iframe sandboxed without `allow-same-origin` has an opaque origin (no storage, no
 * cookies), its policy refuses every request, and the code runs in a worker inside it that is ended
 * after a few seconds, so a loop that never ends can't hold the page.
 */

export type TextPart = { kind: 'text'; text: string } | { kind: 'code'; language: string; code: string };

const FENCE = /^```([\w+-]*)[^\n]*\n([\s\S]*?)^```[ \t]*$/gm;

/** A message's text in order: prose, and each closed fence as code. An unclosed fence stays prose. */
export function textAndCode(text: string): TextPart[] {
  const parts: TextPart[] = [];
  let at = 0;
  for (const match of text.matchAll(FENCE)) {
    if (match.index > at) parts.push({ kind: 'text', text: text.slice(at, match.index) });
    parts.push({ kind: 'code', language: (match[1] ?? '').toLowerCase(), code: (match[2] ?? '').replace(/\n$/, '') });
    at = match.index + match[0].length;
  }
  if (at < text.length) parts.push({ kind: 'text', text: text.slice(at) });
  return parts.filter((part) => part.kind === 'code' || part.text.trim() !== '');
}

const RUNNABLE = new Set(['js', 'javascript', 'mjs']);

/** Whether a block's language is one the runner runs. */
export function isRunnable(language: string): boolean {
  return RUNNABLE.has(language);
}

/** How long code may run before the runner ends it. */
export const RUN_LIMIT_MS = 3000;

/** A string as a JavaScript literal that can't close the script element it sits in. */
function scriptLiteral(value: string): string {
  return JSON.stringify(value).replaceAll('<', '\\u003c').replaceAll('\u2028', '\\u2028').replaceAll('\u2029', '\\u2029');
}

/** What a run reports back to the page. */
export interface RunReport {
  run: string;
  lines: string[];
  error: string | null;
  stopped: boolean;
}

const WORKER = `
const show = (value) => {
  if (typeof value === 'string') return value;
  try { const text = JSON.stringify(value); return text === undefined ? String(value) : text; } catch { return String(value); }
};
const lines = [];
for (const level of ['log', 'info', 'warn', 'error', 'debug']) {
  console[level] = (...values) => { lines.push(values.map(show).join(' ')); };
}
self.onmessage = async (event) => {
  try {
    const result = await (0, eval)(event.data);
    if (result !== undefined) lines.push('\\u2190 ' + show(result));
    self.postMessage({ lines, error: null });
  } catch (error) {
    self.postMessage({ lines, error: String(error) });
  }
};
`;

/** The sandboxed document for one run of `code`. */
export function runnerDocument(run: string, code: string): string {
  return `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; worker-src blob:">
</head><body><script>
const run = ${scriptLiteral(run)};
const report = (lines, error, stopped) => parent.postMessage({ run, lines, error, stopped }, '*');
const worker = new Worker(URL.createObjectURL(new Blob([${scriptLiteral(WORKER)}], { type: 'text/javascript' })));
const limit = setTimeout(() => { worker.terminate(); report([], null, true); }, ${RUN_LIMIT_MS});
worker.onmessage = (event) => { clearTimeout(limit); worker.terminate(); report(event.data.lines, event.data.error, false); };
worker.onerror = (event) => { clearTimeout(limit); worker.terminate(); report([], String(event.message), false); event.preventDefault(); };
worker.postMessage(${scriptLiteral(code)});
</script></body></html>`;
}

/** A run's report, if `data` is one for `run`; anything else posted to the page is ignored. */
export function runReport(data: unknown, run: string): RunReport | null {
  if (typeof data !== 'object' || data === null || Reflect.get(data, 'run') !== run) return null;
  const lines: unknown = Reflect.get(data, 'lines');
  const error: unknown = Reflect.get(data, 'error');
  return {
    run,
    lines: Array.isArray(lines) ? lines.filter((line): line is string => typeof line === 'string') : [],
    error: typeof error === 'string' ? error : null,
    stopped: Reflect.get(data, 'stopped') === true,
  };
}
