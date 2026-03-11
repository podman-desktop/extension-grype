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
import { GrypeDocumentSchema } from './grype';

import { test, expect } from 'vitest';
import * as helloWorld from '../fixtures/grype/hello-world.json' with { type: 'json' };

interface TestCase {
  name: string;
  input: unknown;
  success: boolean;
}

test.each<TestCase>([
  {
    name: 'empty object should be failing',
    success: false,
    input: {},
  },
  {
    name: 'quay.io/podman/hello result',
    success: true,
    input: helloWorld,
  },
])('$name', ({ input, success }) => {
  const result = GrypeDocumentSchema.safeParse(input);
  expect(result.success).toEqual(success);
});
