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

import { test, vi, beforeEach, describe, expect, assert } from 'vitest';
import { SyftService } from '/@/services/syft-service';
import type { ExtensionContext, CliTool, ImageInfo } from '@podman-desktop/api';
import { cli as cliApi, containerEngine, ProgressLocation, process, window as windowApi } from '@podman-desktop/api';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { Octokit } from '@octokit/rest';
import { existsSync } from 'node:fs';
import { mkdtempDisposable, rename } from 'node:fs/promises';

vi.mock(import('node:fs'));
vi.mock(import('node:fs/promises'));

const IMAGE_INFO_MOCK: ImageInfo = {
  Containers: 0,
  Created: 0,
  Digest: '',
  Id: 'foo',
  Labels: {},
  ParentId: '',
  RepoTags: undefined,
  SharedSize: 0,
  Size: 0,
  VirtualSize: 0,
  engineId: 'Podman.podman',
  engineName: 'podman',
};

const EXTENSION_CONTEXT_MOCK: ExtensionContext = {
  storagePath: join(tmpdir()),
} as unknown as ExtensionContext;
const OCTOKIT_MOCK: Octokit = {
  repos: {
    listReleases: vi.fn(),
    listReleaseAssets: vi.fn(),
    getReleaseAsset: vi.fn(),
  },
} as unknown as Octokit;
const CLI_TOOL_MOCK: CliTool = {
  // CliToolInfo
  id: 'dummy',
  extensionInfo: {
    id: 'dummy',
    label: 'dummy',
  },
  displayName: 'dummy',
  images: {
    icon: 'dummy.png',
    logo: 'dummy.png',
  },
  markdownDescription: 'dummy',
  name: 'dummy',
  path: join(EXTENSION_CONTEXT_MOCK.storagePath, 'syft'),
  version: '1.0.0',
  // CliTool
  registerUpdate: vi.fn(),
  registerInstaller: vi.fn(),
  onDidUninstall: vi.fn(),
  onDidUpdateVersion: vi.fn(),
  updateVersion: vi.fn(),
  state: 'registered',
  dispose: vi.fn(),
};

let syft: SyftService;

beforeEach(() => {
  vi.resetAllMocks();

  vi.mocked(cliApi.createCliTool).mockReturnValue(CLI_TOOL_MOCK);
  syft = new SyftService(OCTOKIT_MOCK, EXTENSION_CONTEXT_MOCK);

  vi.mocked(mkdtempDisposable).mockResolvedValue({
    path: tmpdir(),
    remove: vi.fn(),
    [Symbol.asyncDispose]: vi.fn(),
  });
});

describe('SyftService#analyse', () => {
  beforeEach(() => {
    return syft.init();
  });

  test('existing file should return it directly', async () => {
    vi.mocked(existsSync).mockReturnValue(true);

    const expected = join(
      EXTENSION_CONTEXT_MOCK.storagePath,
      IMAGE_INFO_MOCK.engineId,
      `${IMAGE_INFO_MOCK.Id}.syft.json`,
    );

    const result = await syft.analyse(IMAGE_INFO_MOCK);
    expect(result).toEqual(expected);

    expect(existsSync).toHaveBeenCalledWith(expected);
  });

  test('should create a task', async () => {
    await syft.analyse(IMAGE_INFO_MOCK);

    expect(windowApi.withProgress).toHaveBeenCalledExactlyOnceWith(
      {
        cancellable: true,
        location: ProgressLocation.TASK_WIDGET,
        title: 'Analysing image foo',
      },
      expect.any(Function),
    );
  });

  test('scan task should save image and execute syft', async () => {
    await syft.analyse(IMAGE_INFO_MOCK);

    const fn = vi.mocked(windowApi.withProgress).mock.calls[0][1];
    assert(fn);

    await fn({ report: vi.fn() }, { isCancellationRequested: false, onCancellationRequested: vi.fn() });

    expect(containerEngine.saveImage).toHaveBeenCalledExactlyOnceWith(
      IMAGE_INFO_MOCK.engineId,
      IMAGE_INFO_MOCK.Id,
      join(tmpdir(), IMAGE_INFO_MOCK.Id),
      undefined,
    );

    expect(mkdtempDisposable).toHaveBeenCalledExactlyOnceWith(join(tmpdir(), IMAGE_INFO_MOCK.engineId));

    const dest = join(tmpdir(), IMAGE_INFO_MOCK.engineId, 'foo.syft.json');
    const tmp = `${dest}.tmp`;

    expect(process.exec).toHaveBeenCalledExactlyOnceWith(
      CLI_TOOL_MOCK.path,
      ['scan', join(tmpdir(), IMAGE_INFO_MOCK.Id), `--output=json=${tmp}`],
      {
        token: undefined,
      },
    );

    expect(rename).toHaveBeenCalledExactlyOnceWith(tmp, dest);
  });
});
