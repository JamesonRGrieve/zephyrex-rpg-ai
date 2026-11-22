// SPDX-License-Identifier: AGPL-3.0-or-later
import { labelLines } from '~/lib/generate';

// POST /v1/ai_chat/label_lines: each line of a saved story message labelled by the decision model.
export const POST = labelLines;
