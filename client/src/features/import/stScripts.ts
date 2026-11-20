// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * SillyTavern's regex scripts (A33) and Quick Reply sets (A38) in, as this app's records. Pure.
 *
 * - A regex script file is one script or a list: `scriptName`, `findRegex`, `replaceString`,
 *   `placement` (1 your input, 2 the AI's output; others have no counterpart here and are dropped),
 *   `disabled`, `markdownOnly` (only as shown), `promptOnly` (only for the model), `minDepth`,
 *   `maxDepth`. A pattern this app cannot run alike in both editions is refused per script.
 * - A Quick Reply set: `qrList` of `{ label, message }` (ST v2 also `title`, `isHidden`).
 */
import { compileFind, type RegexPlacement } from '~/features/chat/regex';

const object = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
const text = (value: unknown): string => (typeof value === 'string' ? value : '');
const depth = (value: unknown): number | null => (typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null);

const PLACEMENTS: Record<number, RegexPlacement> = { 1: 'user_input', 2: 'ai_output' };

export interface ImportedRegexScript {
  name: string;
  find: string;
  replace: string;
  placements: RegexPlacement[];
  display_only: boolean;
  prompt_only: boolean;
  min_depth: number | null;
  max_depth: number | null;
  enabled: boolean;
  position: number;
}

/** The scripts a file holds that this app can run, and the names of those it cannot. */
export function regexScriptsFromJson(json: unknown): { scripts: ImportedRegexScript[]; refused: string[] } {
  const raw = Array.isArray(json) ? json : [json];
  const scripts: ImportedRegexScript[] = [];
  const refused: string[] = [];
  raw.map(object).forEach((script, index) => {
    const name = text(script.scriptName).trim() || `Script ${index + 1}`;
    const find = text(script.findRegex);
    const placements = (Array.isArray(script.placement) ? script.placement : []).flatMap((code) => (typeof code === 'number' && code in PLACEMENTS ? [PLACEMENTS[code] as RegexPlacement] : []));
    const markdownOnly = script.markdownOnly === true;
    const promptOnly = script.promptOnly === true;
    if (find === '' || compileFind(find) === null || placements.length === 0 || (markdownOnly && promptOnly)) {
      refused.push(name);
      return;
    }
    scripts.push({
      name,
      find,
      replace: text(script.replaceString),
      placements: [...new Set(placements)],
      display_only: markdownOnly,
      prompt_only: promptOnly,
      min_depth: depth(script.minDepth),
      max_depth: depth(script.maxDepth),
      enabled: script.disabled !== true,
      position: index,
    });
  });
  return { scripts, refused };
}

export interface ImportedQuickReply {
  label: string;
  message: string;
  action: 'send';
  channel: 'ic';
  enabled: boolean;
  position: number;
}

/** A Quick Reply set's buttons (each sends its line to the story). */
export function quickRepliesFromJson(json: unknown): ImportedQuickReply[] {
  const set = object(json);
  const list = Array.isArray(set.qrList) ? set.qrList : [];
  return list.map(object).flatMap((reply, index) => {
    const label = (text(reply.label) || text(reply.title)).trim();
    const message = text(reply.message).trim();
    return label === '' || message === '' ? [] : [{ label, message, action: 'send' as const, channel: 'ic' as const, enabled: reply.isHidden !== true, position: index }];
  });
}
