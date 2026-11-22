// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * POST /v1/canon_check in the lite edition (docs/DESIGN.md, Canon warnings): the line is put to the
 * person's decision model with the canon in reach (the chat's lore entries whose keys the line
 * names, its frame's truths, its campaign's earlier sessions; first, the wiki records it names), and
 * answered with the notice: why comes from the summary model, and a flag it can't make specific is no
 * notice (the operator, 2026-11-22: "I need WHY!"). With no decision model it answers `none`,
 * `checked: false`. The SaaS twin is ai_chat/BLL_AI_Canon.py;
 * the rules are features/chat/canon.ts.
 */
import { apiErrorResponse, localOwner, readJsonObject, validationError } from '@zephyrex/lite';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import cases from '../../../contract/canon-cases.json';
import {
  type CanonFact,
  canonNotice,
  canonQuestions,
  canonState,
  canonVerdict,
  readWhy,
  whyMessages,
} from '~/features/chat/canon';
import { traitsOf } from '~/features/models/narratorStyle';
import { askDecider, completionContent, decider } from '~/lib/decider';
import { endpoints } from '~/lib/rpgRecords';
import { thinkingFields } from '~/lib/thinking';
import { wikiReader } from '~/lib/wikiWorld';
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

interface WhyRow {
  baseUrl: string;
  model: string;
  apiKey: string;
  isDefault: boolean;
  name: string;
  api?: string | null;
}

/** What specifically differs, from the person's summary model (else their default); null without one. */
async function askWhy(
  ownerId: string,
  speaker: string,
  line: string,
  fact: string | null,
  signal: AbortSignal,
): Promise<string | null> {
  const rows = (await endpoints.list(ownerId, new URLSearchParams())).map((row) => ({
    row: row as unknown as WhyRow,
    fields: endpoints.fields(row),
  }));
  const usable = rows.filter(
    ({ row, fields }) => (row.api ?? 'chat') === 'chat' && !(fields.roles as string[]).includes('search'),
  );
  const picked =
    usable.find(({ fields }) => (fields.roles as string[]).includes('summary')) ??
    usable.find(({ row }) => row.isDefault) ??
    usable[0];
  if (picked === undefined) return null;
  const traits = traitsOf({ model: picked.row.model, traits: (picked.fields.traits ?? {}) as Record<string, never> });
  const answer = await fetch(`${picked.row.baseUrl.replace(/\/+$/u, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(picked.row.apiKey === '' ? {} : { Authorization: `Bearer ${picked.row.apiKey}` }),
    },
    body: JSON.stringify({
      model: picked.row.model,
      messages: whyMessages(speaker, line, fact),
      stream: false,
      max_tokens: cases.why_max_tokens,
      temperature: 0.2,
      // A thinking model answers this without thinking (it's one sentence).
      ...(typeof traits.reasoning_effort === 'string' ? thinkingFields('off', traits.reasoning_effort) : {}),
    }),
    signal,
  }).catch(() => null);
  if (answer === null || !answer.ok) return null;
  const content = completionContent(await answer.json().catch(() => null));
  return content === null ? null : readWhy(content);
}

export async function canonCheck(nextRequest: NextRequest): Promise<Response> {
  try {
    const owner = localOwner(nextRequest);
    const envelope = await readJsonObject(nextRequest);
    const parsed = canonRequest.safeParse(Reflect.get(envelope, 'canon_check'));
    if (!parsed.success) throw validationError('A canon_check object with a chat_id and text is required', 'canon_check');
    const asked = parsed.data;
    const unchecked = Response.json({
      canon_check: { level: 'none', fact: null, reason: '', checked: false, record_name: null, record_id: null },
    });
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
    const frame =
      chat.campaignId === null
        ? null
        : await prisma.campaignFrame.findFirst({
            // A wiki campaign's frame is the one naming it (a frame's id is never chosen).
            where: { OR: [{ id: chat.campaignId }, { wikiCampaignId: chat.campaignId }] },
          });
    const sessions = await prisma.chatSession.findMany({ where: { chatId: chat.id, createdById: owner.id } });
    // The wiki records the line names come first (the composed suite's canon), each with its id.
    const records =
      chat.campaignId === null
        ? []
        : await wikiReader(nextRequest)
            .matching(chat.campaignId, asked.text)
            .catch(() => []);
    const recordFacts: CanonFact[] = records
      .filter((row) => row.name !== '' && row.deleted !== true)
      .map((row) => ({
        title: row.name,
        id: row.id,
        text: [row.summary, Reflect.get(row, 'description'), Reflect.get(row, 'entry')]
          .filter((part): part is string => typeof part === 'string' && part.trim() !== '')
          .map((part) => part.trim())
          .join(' '),
      }))
      .filter((fact) => fact.text !== '');
    const inReach = factsInReach(
      asked.text,
      entries.map((entry) => ({ comment: entry.comment, keys: parseList(entry.keys), content: entry.content })),
      frame === null ? [] : parseList(frame.truths),
      sessions,
      cases.max_facts,
    );
    const facts = [...recordFacts, ...inReach].slice(0, cases.max_facts);
    const answers = await askDecider(
      deciding,
      canonState(asked.speaker, asked.text, facts),
      canonQuestions(facts),
      nextRequest.signal,
    );
    if (answers === null) return unchecked;
    const verdict = canonVerdict(answers, facts, asked.text);
    const why =
      verdict.level === 'none' ? null : await askWhy(owner.id, asked.speaker, asked.text, verdict.fact, nextRequest.signal);
    return Response.json({ canon_check: { ...canonNotice(verdict, why), checked: true } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
