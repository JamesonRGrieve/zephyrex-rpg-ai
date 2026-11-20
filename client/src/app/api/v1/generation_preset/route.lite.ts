// SPDX-License-Identifier: AGPL-3.0-or-later
import { collectionRoutes, localOwner } from '@zephyrex/lite';
import { presets } from '~/lib/rpgRecords';

// GET /v1/generation_preset (list) and POST /v1/generation_preset (create), as server-framework answers them.
export const { GET, POST } = collectionRoutes(presets, localOwner);
