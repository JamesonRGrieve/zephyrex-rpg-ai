// SPDX-License-Identifier: AGPL-3.0-or-later
import { localOwner, recordRoutes } from '@zephyrex/lite';
import { dataDocuments } from '~/lib/dataDocumentRecords';

// GET, PUT (If-Match) and DELETE (If-Match) /v1/data_document/{id}.
export const { GET, PUT, DELETE } = recordRoutes(dataDocuments, localOwner);
