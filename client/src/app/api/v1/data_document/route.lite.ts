// SPDX-License-Identifier: AGPL-3.0-or-later
import { collectionRoutes, localOwner } from '@zephyrex/lite';
import { dataDocuments } from '~/lib/dataDocumentRecords';

// GET /v1/data_document (list; ?scope= and ?scope_id=) and POST /v1/data_document (create).
export const { GET, POST } = collectionRoutes(dataDocuments, localOwner);
