// SPDX-License-Identifier: AGPL-3.0-or-later
import { collectionRoutes, localOwner } from '@zephyrex/lite';
import { characterExpressions } from '~/lib/expressionRecords';

// GET /v1/character_expression (list; ?character_id=) and POST /v1/character_expression (create).
export const { GET, POST } = collectionRoutes(characterExpressions, localOwner);
