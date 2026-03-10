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
import type { Plugin } from 'vite';
import { join } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { compileFromFile } from 'json-schema-to-typescript';

const SYFT_JSON_SCHEMA_URL =
  'https://raw.githubusercontent.com/anchore/syft/refs/tags/v1.42.1/schema/json/schema-16.1.3.json';

export function syftJSONSchema(): Plugin {
  return {
    name: 'vite-plugin-syft-json-schema',
    enforce: 'pre',
    configResolved: async (resolved): Promise<void> => {
      const generated = join(resolved.root, 'src', 'generated');
      await mkdir(generated, { recursive: true });

      const schemaPath = join(generated, 'syft-schema.json');

      const response = await fetch(SYFT_JSON_SCHEMA_URL);

      const content: unknown = await response.json();

      if (!content || typeof content !== 'object' || !('$ref' in content)) throw new Error('invalid json schema');

      // delete the root `$ref`
      // https://github.com/bcherny/json-schema-to-typescript/issues/132
      delete content['$ref'];

      await writeFile(schemaPath, JSON.stringify(content, undefined, 2), 'utf-8');

      // compile from file
      const output = await compileFromFile(schemaPath, {
        unreachableDefinitions: true,
      });

      await writeFile(join(generated, 'syft-schema.d.ts'), output, 'utf-8');
    },
  };
}
