// SPDX-License-Identifier: AGPL-3.0-or-later
import { collectionRoutes, localOwner } from '@zephyrex/lite';
import { endpoints } from '~/lib/rpgRecords';

// GET /v1/model_endpoint (list) and POST /v1/model_endpoint (create), as server-framework answers them.
export const { GET, POST } = collectionRoutes(endpoints, localOwner);
