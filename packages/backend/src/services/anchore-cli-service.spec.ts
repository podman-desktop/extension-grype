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

import { test, vi, beforeEach, expect, describe } from 'vitest';
import { ANCHORE_GITHUB_ORG, AnchoreCliService, type GithubReleaseMetadata } from '/@/services/anchore-cli-service';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { Octokit } from '@octokit/rest';
import { cli as cliApi, process as processApi, window as windowApi } from '@podman-desktop/api';
import type { CliToolInstaller, CliTool, Logger, ExtensionContext, TelemetryLogger } from '@podman-desktop/api';
import type { Endpoints } from '@octokit/types';
import { existsSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import AdmZip from 'adm-zip';
import * as tar from 'tar';
import { platform as nodePlatform } from 'node:process';
import { TELEMETRY_EVENTS } from '/@/utils/telemetry';

vi.mock(import('node:fs'));
vi.mock(import('node:fs/promises'));
vi.mock(import('@octokit/rest'));
vi.mock(import('adm-zip'), () => ({
  default: vi.fn(
    class {
      extractAllTo = vi.fn();
    },
  ) as unknown as typeof AdmZip,
}));
vi.mock(import('tar'));

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

const TELEMETRY_LOGGER_MOCK: TelemetryLogger = {
  logUsage: vi.fn(),
  logError: vi.fn(),
  dispose: vi.fn(),
} as unknown as TelemetryLogger;

class TestCli extends AnchoreCliService {
  public override get icon(): string {
    return 'dummy.png';
  }
  public get toolId(): string {
    return 'dummy';
  }
  public get displayName(): string {
    return 'dummy';
  }
  public get markdownDescription(): string {
    return 'dummy';
  }
  public get repoName(): string {
    return 'dummy';
  }
}

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
  path: undefined,
  version: undefined,
  // CliTool
  registerUpdate: vi.fn(),
  registerInstaller: vi.fn(),
  onDidUninstall: vi.fn(),
  onDidUpdateVersion: vi.fn(),
  updateVersion: vi.fn(),
  state: 'registered',
  dispose: vi.fn(),
};
const LOGGER_MOCK: Logger = {
  log: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
};

const LIST_RELEASES: Endpoints['GET /repos/{owner}/{repo}/releases']['response']['data'] = Array.from({
  length: 10,
}).map((_, index) => ({
  id: index,
  tag_name: `v1.0.${index}`,
  name: `v1.0.${index}`,
  draft: false,
  prerelease: false,
})) as unknown as Endpoints['GET /repos/{owner}/{repo}/releases']['response']['data'];

const LIST_RELEASE_ASSETS: Endpoints['GET /repos/{owner}/{repo}/releases/{release_id}/assets']['response']['data'] = [
  {
    id: 1,
    name: 'dummy_1.0.0_linux_amd64.tar.gz',
  },
  {
    id: 1,
    name: 'dummy_1.0.0_windows_amd64.zip',
  },
  {
    id: 1,
    name: 'dummy_1.0.0_darwin_arm64.tar.gz',
  },
] as unknown as Endpoints['GET /repos/{owner}/{repo}/releases/{release_id}/assets']['response']['data'];

let cli: TestCli;

beforeEach(() => {
  vi.resetAllMocks();

  cli = new TestCli(OCTOKIT_MOCK, EXTENSION_CONTEXT_MOCK, TELEMETRY_LOGGER_MOCK);

  // mock fs
  vi.mocked(rm).mockResolvedValue(undefined);

  vi.mocked(cliApi.createCliTool).mockReturnValue(CLI_TOOL_MOCK);
  vi.mocked(OCTOKIT_MOCK.repos.listReleases).mockResolvedValue({
    headers: {},
    status: 200,
    url: '',
    data: LIST_RELEASES,
  });
  vi.mocked(OCTOKIT_MOCK.repos.listReleaseAssets).mockResolvedValue({
    headers: {},
    status: 200,
    url: '',
    data: LIST_RELEASE_ASSETS,
  });
  vi.mocked(OCTOKIT_MOCK.repos.getReleaseAsset).mockResolvedValue({
    headers: {},
    status: 200,
    url: '',
    data: 'buffer-data',
  } as unknown as Endpoints['GET /repos/{owner}/{repo}/releases/assets/{asset_id}']['response']);
});

describe('TestCli#init', () => {
  test('should register a cli tool', async () => {
    await cli.init();

    expect(cliApi.createCliTool).toHaveBeenCalledExactlyOnceWith({
      displayName: CLI_TOOL_MOCK.displayName,
      images: {
        icon: CLI_TOOL_MOCK.images.icon,
        logo: CLI_TOOL_MOCK.images.logo,
      },
      installationSource: 'extension',
      markdownDescription: CLI_TOOL_MOCK.markdownDescription,
      name: CLI_TOOL_MOCK.name,
      path: undefined,
      version: undefined,
    });
  });

  test('registered cli should have version when existing version is found', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(processApi.exec).mockResolvedValue({
      stdout: 'cli 1.41.2',
      command: 'version',
      stderr: '',
    });

    await cli.init();
    expect(cliApi.createCliTool).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        path: join(EXTENSION_CONTEXT_MOCK.storagePath, cli.toolId, 'dummy'),
        version: '1.41.2',
      }),
    );
  });

  test('should register installer', async () => {
    await cli.init();
    expect(CLI_TOOL_MOCK.registerInstaller).toHaveBeenCalledExactlyOnceWith({
      doUninstall: expect.any(Function),
      doInstall: expect.any(Function),
      selectVersion: expect.any(Function),
    });
  });
});

describe('installer', () => {
  let installer: CliToolInstaller;

  beforeEach(async () => {
    await cli.init();
    installer = vi.mocked(CLI_TOOL_MOCK.registerInstaller).mock.calls[0][0];
  });

  test('doUninstall is not implemented', async () => {
    await expect(async () => {
      return await installer.doUninstall(LOGGER_MOCK);
    }).rejects.toThrow('Not implemented');
  });

  describe('selectVersion', () => {
    beforeEach(() => {
      // simulate the user selecting the latest version
      vi.mocked(windowApi.showQuickPick).mockResolvedValue({
        label: LIST_RELEASES[0].name,
        tag: LIST_RELEASES[0].tag_name,
        id: LIST_RELEASES[0].id,
      } as GithubReleaseMetadata);
    });

    test('expect to listRelease with Octokit client', async () => {
      await installer.selectVersion();

      expect(OCTOKIT_MOCK.repos.listReleases).toHaveBeenCalledExactlyOnceWith({
        owner: ANCHORE_GITHUB_ORG,
        repo: 'dummy',
      });
    });

    test('expect user cancel showQuickPick to throw an error ', async () => {
      vi.mocked(windowApi.showQuickPick).mockResolvedValue(undefined);

      await expect(async () => {
        return await installer.selectVersion();
      }).rejects.toThrow('No version selected');
    });

    test('expect selectVersion to return version without v prefix', async () => {
      const version = await installer.selectVersion();
      // we remove the `v` prefix
      expect(version).toEqual(LIST_RELEASES[0].name?.slice(1));
    });
  });

  describe('doInstall', () => {
    beforeEach(async () => {
      // simulate the user selecting the latest version
      vi.mocked(windowApi.showQuickPick).mockResolvedValue({
        label: LIST_RELEASES[0].name,
        tag: LIST_RELEASES[0].tag_name,
        id: LIST_RELEASES[0].id,
      } as GithubReleaseMetadata);

      // select the latest version
      await installer.selectVersion();
    });

    test(
      'expect zip to be unzip',
      {
        skip: nodePlatform !== 'win32',
      },
      async () => {
        await installer.doInstall(LOGGER_MOCK);

        expect(vi.mocked(AdmZip).mock.instances).toHaveLength(1);
        const instance = vi.mocked(AdmZip).mock.instances[0];
        expect(instance.extractAllTo).toHaveBeenCalledExactlyOnceWith(
          join(EXTENSION_CONTEXT_MOCK.storagePath, cli.toolId),
          true,
        );
      },
    );

    test(
      'expect tar to be untar',
      {
        skip: nodePlatform === 'win32',
      },
      async () => {
        await installer.doInstall(LOGGER_MOCK);

        expect(tar.x).toHaveBeenCalledExactlyOnceWith({
          file: expect.stringContaining('tar.gz'),
          cwd: join(EXTENSION_CONTEXT_MOCK.storagePath, cli.toolId),
        });
      },
    );

    test('expect telemetry to be sent', async () => {
      await installer.doInstall(LOGGER_MOCK);

      expect(TELEMETRY_LOGGER_MOCK.logUsage).toHaveBeenCalledExactlyOnceWith(TELEMETRY_EVENTS.CLI_INSTALL, {
        duration: expect.any(Number),
        tag: LIST_RELEASES[0].tag_name,
        toolId: cli.toolId,
      });
    });

    test('expect error to be included in telemetry', async () => {
      const HTTP_ERROR_MOCK = new Error('dummy http error');
      vi.mocked(OCTOKIT_MOCK.repos.listReleaseAssets).mockRejectedValue(HTTP_ERROR_MOCK);

      await expect(async () => {
        await installer.doInstall(LOGGER_MOCK);
      }).rejects.toThrow(HTTP_ERROR_MOCK);

      expect(TELEMETRY_LOGGER_MOCK.logUsage).toHaveBeenCalledExactlyOnceWith(
        TELEMETRY_EVENTS.CLI_INSTALL,
        expect.objectContaining({
          error: HTTP_ERROR_MOCK,
        }),
      );
    });
  });
});

test('TestCli#dispose should dispose CliTool', async () => {
  await cli.init();

  expect(CLI_TOOL_MOCK.dispose).not.toHaveBeenCalled();

  cli.dispose();

  expect(CLI_TOOL_MOCK.dispose).toHaveBeenCalledOnce();
});
