// SPDX-License-Identifier: AGPL-3.0-or-later
import { needsRoll } from '~/lib/generate';

// POST /v1/ai_chat/needs_roll: whether a character's action needs a roll, and which (lib/generate.ts).
export const POST = needsRoll;
