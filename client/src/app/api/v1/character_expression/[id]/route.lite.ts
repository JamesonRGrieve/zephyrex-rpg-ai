// SPDX-License-Identifier: AGPL-3.0-or-later
import { localOwner, recordRoutes } from '@zephyrex/lite';
import { characterExpressions } from '~/lib/expressionRecords';

// GET, PUT (If-Match) and DELETE (If-Match) /v1/character_expression/{id}.
export const { GET, PUT, DELETE } = recordRoutes(characterExpressions, localOwner);
