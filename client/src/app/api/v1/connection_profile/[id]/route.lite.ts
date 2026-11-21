// SPDX-License-Identifier: AGPL-3.0-or-later
import { localOwner, recordRoutes } from '@zephyrex/lite';
import { connectionProfiles } from '~/lib/connectionProfileRecords';

// GET, PUT (If-Match) and DELETE (If-Match) /v1/connection_profile/{id}, audit gap 8.
export const { GET, PUT, DELETE } = recordRoutes(connectionProfiles, localOwner);
