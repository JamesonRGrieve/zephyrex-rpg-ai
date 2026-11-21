// SPDX-License-Identifier: AGPL-3.0-or-later
import { worldTick } from '~/lib/generate';

// POST /v1/ai_chat/world_tick: in-world time passes and NPCs go about their routines (lib/generate.ts).
export const POST = worldTick;
