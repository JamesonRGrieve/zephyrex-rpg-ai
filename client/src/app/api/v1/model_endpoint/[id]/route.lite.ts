// SPDX-License-Identifier: AGPL-3.0-or-later
import { localOwner, recordRoutes } from '@zephyrex/lite';
import { endpoints } from '~/lib/rpgRecords';

// GET, PUT (If-Match) and DELETE (If-Match) /v1/model_endpoint/{id}, as server-framework answers them.
export const { GET, PUT, DELETE } = recordRoutes(endpoints, localOwner);
