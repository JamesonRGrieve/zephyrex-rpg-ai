// SPDX-License-Identifier: AGPL-3.0-or-later
import { localOwner, recordRoutes } from '@zephyrex/lite';
import { scenarios } from '~/lib/campaignRecords';

// GET, PUT (If-Match) and DELETE (If-Match) /v1/scenario/{id}.
export const { GET, PUT, DELETE } = recordRoutes(scenarios, localOwner);
