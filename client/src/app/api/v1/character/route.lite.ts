// SPDX-License-Identifier: AGPL-3.0-or-later
import { collectionRoutes, localOwner } from '@zephyrex/lite';
import { characters } from '~/lib/rpgRecords';

// GET /v1/character (list) and POST /v1/character (create), as server-framework answers them.
export const { GET, POST } = collectionRoutes(characters, localOwner);
