// SPDX-License-Identifier: AGPL-3.0-or-later
import { cardPerson } from '~/lib/cardPerson';

// POST /v1/ai_chat/card_person: a character card's wiki person, imported once then reused (lib/cardPerson.ts).
export const POST = cardPerson;
