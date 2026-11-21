// SPDX-License-Identifier: AGPL-3.0-or-later
import { collectionRoutes, localOwner } from '@zephyrex/lite';
import { connectionProfiles } from '~/lib/connectionProfileRecords';

// GET /v1/connection_profile (list, by name) and POST /v1/connection_profile (create), audit gap 8.
export const { GET, POST } = collectionRoutes(connectionProfiles, localOwner);
