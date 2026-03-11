/**********************************************************************
 * Copyright (C) 2026 Red Hat, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * SPDX-License-Identifier: Apache-2.0
 ***********************************************************************/
import type { ZodType } from 'zod';
import { z } from 'zod';
import * as jsonSchema from '../generated/syft-schema.json' with { type: 'json' };
import type { Document } from '../generated/syft-schema';

type JSONSchema = Parameters<typeof z.fromJSONSchema>[0];

export const SyftDocumentSchema = z.fromJSONSchema(jsonSchema as JSONSchema) as ZodType<Document>;

// export all syft generated types
export * from '../generated/syft-schema';
