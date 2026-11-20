// SPDX-License-Identifier: AGPL-3.0-or-later
import { ping } from '~/lib/generate';

// POST /v1/ai_chat/ping: whether a model's server answers, and how quickly (lib/generate.ts).
export const POST = ping;
