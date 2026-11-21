// SPDX-License-Identifier: AGPL-3.0-or-later
import { nextTurn } from '~/lib/generate';

// POST /v1/ai_chat/next_turn: who speaks next, by the decision model (lib/generate.ts).
export const POST = nextTurn;
