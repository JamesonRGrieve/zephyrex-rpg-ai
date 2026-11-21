// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * POST /v1/canon_check in the lite edition (docs/DESIGN.md, Canon warnings): the line is put to the
 * person's decision model with the canon in reach (the chat's lore entries whose keys the line
 * names, its frame's truths, its campaign's earlier sessions), and answered with the notice. With
 * no decision model it answers `none`, `checked: false`. The SaaS twin is ai_chat/BLL_AI_Canon.py;
 * the rules are features/chat/canon.ts.
 */
import { apiErrorResponse, localOwner, readJsonObject, validationError } from '@zephyrex/lite';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import cases from '../../../contract/canon-cases.json';
import { type CanonFact, canonQuestions, canonState, canonVerdict } from '~/features/chat/canon';
import { askDecider, decider } from '~/lib/decider';
import { prisma } from '~/lib/prisma';

const canonRequest = z.object({
  chat_id: z.string().min(1),
  text: z.string().min(1).max(20000),
  speaker: z.string().max(200).default('The GM'),
});

const escaped = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The canon the line is checked against: lore it names, the frame's truths, earlier sessions. */
export function factsInReach(
  text: string,
  entries: readonly { comment: string; keys: readonly string[]; content: string }[],
  truths: readonly string[],
  summaries: readonly { number: number; summary: string }[],
  limit: number,
): CanonFact[] {
  const lowered = text.toLowerCase();
  const named = entries.flatMap((entry) => {
    const keys = entry.keys.filter((key) => key.trim() !== '');
    const hit = keys.some((key) => new RegExp(`(?<!\\w)${escaped(key.toLowerCase())}(?!\\w)`).test(lowered));
    return hit ? [{ title: entry.comment || (keys[0] ?? ''), text: entry.content }] : [];
  });
  return [
    ...named,
    ...truths.map((truth, index) => ({ title: `Truth ${index + 1}`, text: truth })),
    ...summaries
      .filter((one) => one.summary.trim() !== '')
      .map((one) => ({ title: `Session ${one.number}`, text: one.summary })),
  ].slice(0, limit);
}

const parseList = (raw: string): string[] => {
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
};

export async function canonCheck(nextRequest: NextRequest): Promise<Response> {
  try {
    const owner = localOwner(nextRequest);
    const envelope = await readJsonObject(nextRequest);
    const parsed = canonRequest.safeParse(Reflect.get(envelope, 'canon_check'));
    if (!parsed.success) throw validationError('A canon_check object with a chat_id and text is required', 'canon_check');
    const asked = parsed.data;
    const unchecked = Response.json({ canon_check: { level: 'none', fact: null, reason: '', checked: false } });
    const chat = await prisma.chat.findFirst({ where: { id: asked.chat_id, createdById: owner.id } });
    if (chat === null) throw validationError('That chat is not one of yours', 'chat_id');
    // A campaign that breaks canon on purpose turns its warnings off (the chat's canon_checks).
    if (!chat.canonChecks) return unchecked;
    const deciding = await decider(owner.id);
    if (deciding === null) return unchecked;
    const bookIds = parseList(chat.lorebookIds);
    const entries =
      bookIds.length === 0
        ? []
        : await prisma.lorebookEntry.findMany({
            where: { createdById: owner.id, lorebookId: { in: bookIds }, enabled: true },
          });
    const frame = chat.campaignId === null ? null : await prisma.campaignFrame.findFirst({ where: { id: chat.campaignId } });
    const sessions = await prisma.chatSession.findMany({ where: { chatId: chat.id, createdById: owner.id } });
    const facts = factsInReach(
      asked.text,
      entries.map((entry) => ({ comment: entry.comment, keys: parseList(entry.keys), content: entry.content })),
      frame === null ? [] : parseList(frame.truths),
      sessions,
      cases.max_facts,
    );
    const answers = await askDecider(
      deciding,
      canonState(asked.speaker, asked.text, facts),
      canonQuestions(facts),
      nextRequest.signal,
    );
    if (answers === null) return unchecked;
    return Response.json({ canon_check: { ...canonVerdict(answers, facts), checked: true } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
