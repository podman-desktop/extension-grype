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

import { test, vi, beforeEach, expect, describe, assert } from 'vitest';
import { CacheService } from '/@/services/cache-service';
import type { CancellationToken, ExtensionContext } from '@podman-desktop/api';
import { commands, ProgressLocation, window } from '@podman-desktop/api';
import { contributes } from '../../package.json';
import { rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';

vi.mock(import('node:fs'));
vi.mock(import('node:fs/promises'));

const EXTENSION_CONTEXT_MOCK: ExtensionContext = {
  storagePath: 'foo',
} as unknown as ExtensionContext;

let cache: CacheService;
beforeEach(() => {
  vi.resetAllMocks();

  cache = new CacheService(EXTENSION_CONTEXT_MOCK);
});

test('CacheService#getCacheDirectory', () => {
  expect(cache.getCacheDirectory()).toBeTypeOf('string');
});

describe('init', () => {
  test('init should register command matching the one defined in package.json', async () => {
    await cache.init();

    expect(commands.registerCommand).toHaveBeenCalledExactlyOnceWith(
      contributes.commands[0].command,
      expect.any(Function),
    );
  });
});

describe('grype:clear-cache command', () => {
  let listener: () => Promise<void>;

  beforeEach(async () => {
    await cache.init();

    const fn = vi.mocked(commands.registerCommand).mock.calls[0][1];
    assert(fn);

    listener = fn;
  });

  test('command should start task', async () => {
    expect(window.withProgress).not.toHaveBeenCalled();

    await listener();

    expect(window.withProgress).toHaveBeenCalledExactlyOnceWith(
      {
        location: ProgressLocation.TASK_WIDGET,
        title: 'Grype: clearing cache',
      },
      expect.any(Function),
    );
  });

  test('full workflow should call rm with recursive option', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(window.withProgress).mockImplementation((_, fn) => {
      return fn({ report: vi.fn() }, {} as CancellationToken);
    });

    await listener();

    expect(rm).toHaveBeenCalledExactlyOnceWith(cache.getCacheDirectory(), { recursive: true });
  });
});
