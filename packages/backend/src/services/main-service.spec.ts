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

import { test, vi, beforeEach, expect } from 'vitest';
import { MainService } from '/@/services/main-service';
import type { ExtensionContext } from '@podman-desktop/api';

import { InversifyBinding } from '/@/inject/inversify-binding';
import type { Container } from 'inversify';
import { ApiService } from '/@/services/api-service';

vi.mock(import('/@/inject/inversify-binding'));

const INVERSIFY_CONTAINER_MOCK: Container = {
  getAsync: vi.fn(),
} as unknown as Container;
const API_SERVICE_MOCK: ApiService = {
  init: vi.fn(),
} as unknown as ApiService;
const EXTENSION_CONTEXT_MOCK: ExtensionContext = {} as unknown as ExtensionContext;

let main: MainService;

beforeEach(() => {
  vi.resetAllMocks();

  vi.mocked(InversifyBinding.prototype.init).mockResolvedValue(INVERSIFY_CONTAINER_MOCK);
  vi.mocked(INVERSIFY_CONTAINER_MOCK.getAsync).mockImplementation(async identifier => {
    switch (identifier) {
      case ApiService:
        return API_SERVICE_MOCK;
      default:
        throw new Error(`unknown identifier ${String(identifier)}`);
    }
  });
  main = new MainService();
});

test('expect MainService#init to init InversifyBinding', async () => {
  await main.init(EXTENSION_CONTEXT_MOCK);

  expect(InversifyBinding.prototype.init).toHaveBeenCalledOnce();
});

test('expect MainService#asyncDispose to dispose InversifyBinding', async () => {
  await main.init(EXTENSION_CONTEXT_MOCK);

  expect(InversifyBinding.prototype.asyncDispose).not.toHaveBeenCalled();

  await main.asyncDispose();

  expect(InversifyBinding.prototype.asyncDispose).toHaveBeenCalledOnce();
});
