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
import type { ExtensionContext, CliTool, TelemetryLogger } from '@podman-desktop/api';
import { window, cli as cliApi, ProgressLocation, process, window as windowApi } from '@podman-desktop/api';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { Octokit } from '@octokit/rest';
import type { Stats } from 'node:fs';
import { existsSync } from 'node:fs';
import { GrypeService, MAX_CACHE_AGE } from '/@/services/grype-service';
import type { grype } from '@podman-desktop/grype-extension-api';
import { readFile, rename, stat } from 'node:fs/promises';

vi.mock(import('node:fs'));
vi.mock(import('node:fs/promises'));

const GRYPE_DOCUMENT_MOCK: grype.Document = {
  matches: [],
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
  path: join(EXTENSION_CONTEXT_MOCK.storagePath, 'grype'),
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
const TELEMETRY_LOGGER_MOCK: TelemetryLogger = {
  logUsage: vi.fn(),
  logError: vi.fn(),
  dispose: vi.fn(),
} as unknown as TelemetryLogger;

let grypeService: GrypeService;

beforeEach(() => {
  vi.resetAllMocks();

  vi.mocked(cliApi.createCliTool).mockReturnValue(CLI_TOOL_MOCK);
  grypeService = new GrypeService(OCTOKIT_MOCK, EXTENSION_CONTEXT_MOCK, TELEMETRY_LOGGER_MOCK);

  vi.mocked(readFile).mockResolvedValue(JSON.stringify(GRYPE_DOCUMENT_MOCK));

  vi.mocked(stat).mockResolvedValue({
    mtimeMs: Date.now(),
  } as unknown as Stats);
});

describe('GrypeService#analyse', () => {
  beforeEach(() => {
    return grypeService.init();
  });

  test('non-existent sbom should throw an error', async () => {
    await expect(async () => {
      await grypeService.analyse('fake');
    }).rejects.toThrowError('cannot analyse without sbom file');
  });

  test('existing sbom and cached grype output should return it', async () => {
    vi.mocked(existsSync).mockReturnValue(true);

    const result = await grypeService.analyse('foo.syft.json');

    expect(readFile).toHaveBeenCalledExactlyOnceWith('foo.grype.json', 'utf-8');
    expect(result).toStrictEqual(GRYPE_DOCUMENT_MOCK);
    expect(window.withProgress).not.toHaveBeenCalled();
  });

  test('expired grype cache should ignore it', async () => {
    vi.mocked(existsSync).mockReturnValue(true);

    vi.mocked(stat).mockResolvedValue({
      mtimeMs: Date.now() - 2 * MAX_CACHE_AGE,
    } as unknown as Stats);

    await grypeService.analyse('foo.syft.json');

    expect(window.withProgress).toHaveBeenCalled();
  });

  test('should create a task', async () => {
    vi.mocked(existsSync).mockReturnValueOnce(true);

    await grypeService.analyse('foo.syft.json');

    expect(windowApi.withProgress).toHaveBeenCalledExactlyOnceWith(
      {
        cancellable: true,
        location: ProgressLocation.TASK_WIDGET,
        title: 'Analysing sbom',
      },
      expect.any(Function),
    );
  });

  test('grype task should call binary and read output', async () => {
    vi.mocked(existsSync).mockReturnValueOnce(true);

    const sbom = 'foo.syft.json';
    await grypeService.analyse(sbom);

    const fn = vi.mocked(windowApi.withProgress).mock.calls[0][1];
    assert(fn);

    const result = await fn({ report: vi.fn() }, { isCancellationRequested: false, onCancellationRequested: vi.fn() });

    expect(process.exec).toHaveBeenCalledExactlyOnceWith(
      CLI_TOOL_MOCK.path,
      [`sbom:${sbom}`, '--output=json', '--file=foo.grype.json.tmp'],
      {
        token: undefined,
      },
    );
    expect(rename).toHaveBeenCalledExactlyOnceWith('foo.grype.json.tmp', 'foo.grype.json');
    expect(result).toStrictEqual(GRYPE_DOCUMENT_MOCK);
  });
});
