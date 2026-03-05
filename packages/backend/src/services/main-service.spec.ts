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

import { test, vi, beforeEach, expect, assert } from 'vitest';
import { MainService } from './main-service';
import type { ExtensionContext, Disposable } from '@podman-desktop/api';

import { SyftService } from './syft-service';
import { GrypeService } from './grype-service';
import type { AsyncInit } from '../utils/async-init';
import { Octokit } from '@octokit/rest';

vi.mock(import('./syft-service'));
vi.mock(import('./grype-service'));
vi.mock(import('@octokit/rest'));

const EXTENSION_CONTEXT_MOCK: ExtensionContext = {} as unknown as ExtensionContext;

let main: MainService;

beforeEach(() => {
  vi.resetAllMocks();

  main = new MainService();
});

test('octokit request signal should be aborted after Main#dispose', async () => {
  await main.init(EXTENSION_CONTEXT_MOCK);

  expect(Octokit).toHaveBeenLastCalledWith({
    request: {
      signal: expect.any(AbortSignal),
    },
  });

  const options = vi.mocked(Octokit).mock.calls[0][0];
  assert(options?.request?.signal);

  expect(options.request.signal.aborted).toBeFalsy();

  main.dispose();
  expect(options.request.signal.aborted).toBeTruthy();
});

test.each<{ prototype: AsyncInit & Disposable; name: string }>([
  {
    prototype: SyftService.prototype,
    name: SyftService.name,
  },
  {
    prototype: GrypeService.prototype,
    name: GrypeService.name,
  },
])('expect $name to be init on Main#init and dispose on Main#dispose', async ({ prototype }) => {
  await main.init(EXTENSION_CONTEXT_MOCK);

  expect(prototype.init).toHaveBeenCalledOnce();
  expect(prototype.dispose).not.toHaveBeenCalled();

  main.dispose();
  expect(prototype.dispose).toHaveBeenCalledOnce();
});