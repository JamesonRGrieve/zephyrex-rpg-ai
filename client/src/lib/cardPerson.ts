// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * A character card's wiki person, the lite twin of ai_chat/BLL_AI_CardPerson.py (the operator's composed
 * suite: "A character card imports as a wiki person with its voice … a reply speaks as that person"). The
 * person the card is linked to, or the card imported once (the wiki's card_person: a person of the
 * owner's own "Characters" campaign) and then linked in the card's extensions, so a second Chat reuses it.
 * Lite keeps no uploads, so only an https avatar goes along.
 */
import { ApiError, apiErrorResponse, localOwner, notFound, readJsonObject, validationError } from '@zephyrex/lite';
import type { NextRequest } from 'next/server';
import { prisma } from '~/lib/prisma';
import { characters } from '~/lib/rpgRecords';
import { wikiReader } from '~/lib/wikiWorld';

/** Where a card keeps its wiki person: {person_id, campaign_id}. */
export const LINK = 'zephyrex_rpg_person';

const parsed = (raw: string, fallback: unknown): unknown => {
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
};

/** The person a card is linked to, from its extensions, or null. */
export function cardLink(extensions: unknown): { person_id: string; campaign_id: string } | null {
  const link: unknown = Reflect.get(Object(extensions), LINK);
  const personId: unknown = Reflect.get(Object(link), 'person_id');
  const campaignId: unknown = Reflect.get(Object(link), 'campaign_id');
  return typeof personId === 'string' && personId !== '' && typeof campaignId === 'string' && campaignId !== ''
    ? { person_id: personId, campaign_id: campaignId }
    : null;
}

export async function cardPerson(nextRequest: NextRequest): Promise<Response> {
  try {
    const owner = localOwner(nextRequest);
    const envelope = await readJsonObject(nextRequest);
    const cardId: unknown = Reflect.get(Object(Reflect.get(envelope, 'card_person')), 'card_id');
    if (typeof cardId !== 'string' || cardId === '')
      throw validationError('A card_person object with a card_id is required', 'card_id');
    const card = await prisma.character.findFirst({ where: { id: cardId, createdById: owner.id } });
    if (card === null) throw notFound(characters.modelName);
    const extensions = parsed(card.extensions, {}) as Record<string, unknown>;
    const reader = wikiReader(nextRequest);
    const link = cardLink(extensions);
    if (link !== null && (await reader.byIds([link.person_id])).length > 0) {
      return Response.json({ card_person: { ...link, imported: false } });
    }
    const { [LINK]: _old, ...own } = extensions;
    const fields: Record<string, unknown> = {
      name: card.name,
      description: card.description,
      personality: card.personality,
      scenario: card.scenario,
      first_message: card.firstMessage,
      alternate_greetings: parsed(card.alternateGreetings, []),
      example_messages: card.exampleMessages,
      system_prompt: card.systemPrompt,
      post_history_instructions: card.postHistoryInstructions,
      tags: parsed(card.tags, []),
      extensions: own,
      ...(card.avatar?.startsWith('https://') === true ? { avatar: card.avatar } : {}),
    };
    const made = await reader.cardPerson(
      Object.fromEntries(
        Object.entries(fields).filter(([, value]) => value !== '' && !(Array.isArray(value) && value.length === 0)),
      ),
    );
    if (made === null) throw new ApiError(502, { message: 'The wiki made no person for the card', code: 'no_person' });
    await prisma.character.update({
      where: { id: card.id },
      data: { extensions: JSON.stringify({ ...own, [LINK]: made }) },
    });
    return Response.json({ card_person: { ...made, imported: true } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
