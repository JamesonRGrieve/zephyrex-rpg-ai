// SPDX-License-Identifier: AGPL-3.0-or-later
import { speech } from '~/lib/speech';

// POST /v1/ai_chat/speech: a line read aloud by a model set to speak (lib/speech.ts).
export const POST = speech;
