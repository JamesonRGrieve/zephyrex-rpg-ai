// SPDX-License-Identifier: AGPL-3.0-or-later
import { localOwner, recordRoutes } from '@zephyrex/lite';
import { personas } from '~/lib/rpgRecords';

// GET, PUT (If-Match) and DELETE (If-Match) /v1/persona/{id}, as server-framework answers them.
export const { GET, PUT, DELETE } = recordRoutes(personas, localOwner);
