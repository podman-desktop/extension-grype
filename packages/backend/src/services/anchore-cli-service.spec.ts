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
import {
  ANCHORE_GITHUB_ORG,
  AnchoreCliService,
  type GithubReleaseMetadata,
  type InstallationInfo,
} from '/@/services/anchore-cli-service';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { Octokit } from '@octokit/rest';
import { cli as cliApi, env as envApi, process as processApi, window as windowApi } from '@podman-desktop/api';
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
vi.mock(import('node:os'));
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
  storagePath: join('/tmp'),
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
  protected override cancelAll(): void {}
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
  public override getSystemBinaryPath(): string {
    return super.getSystemBinaryPath();
  }
  public override where(): Promise<string | undefined> {
    return super.where();
  }
  public override getInstalledInfo(): Promise<InstallationInfo> {
    return super.getInstalledInfo();
  }
  public override installSystemWide(binaryPath: string): Promise<string | undefined> {
    return super.installSystemWide(binaryPath);
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

  // reset non-mock properties on shared CliTool object
  CLI_TOOL_MOCK.path = undefined;
  CLI_TOOL_MOCK.version = undefined;

  // mock homedir
  vi.mocked(homedir).mockReturnValue('/home/testuser');

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
      installationSource: undefined,
      markdownDescription: CLI_TOOL_MOCK.markdownDescription,
      name: CLI_TOOL_MOCK.name,
      path: undefined,
      version: undefined,
    });
  });

  test('registered cli should have version when existing version is found', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    // where() throws → falls back to internalBinaryPath
    vi.mocked(processApi.exec)
      .mockRejectedValueOnce(new Error('not found'))
      .mockResolvedValueOnce({
        stdout: 'cli 1.41.2',
        command: 'version',
        stderr: '',
      });

    await cli.init();
    expect(cliApi.createCliTool).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        path: join(EXTENSION_CONTEXT_MOCK.storagePath, cli.toolId, 'dummy'),
        version: '1.41.2',
        installationSource: 'extension',
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

  test('doUninstall should rm the tool directory', async () => {
    await installer.doUninstall(LOGGER_MOCK);

    expect(rm).toHaveBeenCalledExactlyOnceWith(join(EXTENSION_CONTEXT_MOCK.storagePath, cli.toolId), {
      force: true,
      maxRetries: 2,
      recursive: true,
      retryDelay: 5_000,
    });
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

describe('install', () => {
  test('calling installer with an already installed binary should do nothing', async () => {
    CLI_TOOL_MOCK.path = '/foo/bar';
    CLI_TOOL_MOCK.version = '1.2.3';

    await cli.init();

    await cli.install();
    expect(OCTOKIT_MOCK.repos.listReleases).not.toHaveBeenCalled();
  });
});

describe('isInstalled', () => {
  test('cli not initialized should be marked as not installed', async () => {
    expect(cli.isInstalled()).toBeFalsy();
  });

  test('cli initialized without version should be marked as not installed', async () => {
    CLI_TOOL_MOCK.path = undefined;
    CLI_TOOL_MOCK.version = undefined;

    expect(cli.isInstalled()).toBeFalsy();
  });

  test('cli initialized with corresponding version should be marked as installed', async () => {
    CLI_TOOL_MOCK.path = '/foo/bar';
    CLI_TOOL_MOCK.version = '1.2.3';

    await cli.init();

    expect(cli.isInstalled()).toBeTruthy();
  });
});

test('TestCli#dispose should dispose CliTool', async () => {
  await cli.init();

  expect(CLI_TOOL_MOCK.dispose).not.toHaveBeenCalled();

  cli.dispose();

  expect(CLI_TOOL_MOCK.dispose).toHaveBeenCalledOnce();
});

describe('getSystemBinaryPath', () => {
  test('should return /usr/local/bin path on Linux/Mac', () => {
    Object.defineProperty(envApi, 'isWindows', { value: false, configurable: true });

    expect(cli.getSystemBinaryPath()).toBe(join('/usr', 'local', 'bin', 'dummy'));
  });

  test('should return Windows AppData path with .exe on Windows', () => {
    Object.defineProperty(envApi, 'isWindows', { value: true, configurable: true });

    expect(cli.getSystemBinaryPath()).toBe(
      join(homedir(), 'AppData', 'Local', 'Microsoft', 'WindowsApps', 'dummy.exe'),
    );
  });
});

describe('where', () => {
  test('should return path from which on non-Windows', async () => {
    Object.defineProperty(envApi, 'isWindows', { value: false, configurable: true });
    vi.mocked(processApi.exec).mockResolvedValue({
      stdout: '/usr/local/bin/dummy',
      command: 'which',
      stderr: '',
    });

    const result = await cli.where();
    expect(result).toBe('/usr/local/bin/dummy');
    expect(processApi.exec).toHaveBeenCalledWith('which', ['dummy']);
  });

  test('should return cleaned path from where on Windows', async () => {
    Object.defineProperty(envApi, 'isWindows', { value: true, configurable: true });
    vi.mocked(processApi.exec).mockResolvedValue({
      stdout: 'C:\\Users\\test\\dummy.exe\r\n',
      command: 'where',
      stderr: '',
    });

    const result = await cli.where();
    expect(result).toBe('C:\\Users\\test\\dummy.exe');
    expect(processApi.exec).toHaveBeenCalledWith('where', ['dummy']);
  });

  test('should return undefined when exec throws', async () => {
    vi.mocked(processApi.exec).mockRejectedValue(new Error('not found'));

    const result = await cli.where();
    expect(result).toBeUndefined();
  });
});

describe('getInstalledInfo', () => {
  test('should return source extension when where() finds binary at system binary path', async () => {
    Object.defineProperty(envApi, 'isWindows', { value: false, configurable: true });
    const systemPath = cli.getSystemBinaryPath();

    vi.mocked(processApi.exec)
      .mockResolvedValueOnce({ stdout: systemPath, command: 'which', stderr: '' })
      .mockResolvedValueOnce({ stdout: 'dummy 1.2.3', command: 'version', stderr: '' });

    const info = await cli.getInstalledInfo();
    expect(info).toEqual({
      path: systemPath,
      version: '1.2.3',
      source: 'extension',
    });
  });

  test('should return source external when where() finds binary at different path', async () => {
    Object.defineProperty(envApi, 'isWindows', { value: false, configurable: true });

    vi.mocked(processApi.exec)
      .mockResolvedValueOnce({ stdout: '/custom/path/dummy', command: 'which', stderr: '' })
      .mockResolvedValueOnce({ stdout: 'dummy 2.0.0', command: 'version', stderr: '' });

    const info = await cli.getInstalledInfo();
    expect(info).toEqual({
      path: '/custom/path/dummy',
      version: '2.0.0',
      source: 'external',
    });
  });

  test('should fallback to internalBinaryPath when where() returns undefined', async () => {
    vi.mocked(processApi.exec)
      .mockRejectedValueOnce(new Error('not found'))
      .mockResolvedValueOnce({ stdout: 'dummy 3.0.0', command: 'version', stderr: '' });

    const info = await cli.getInstalledInfo();
    expect(info).toEqual({
      path: join(EXTENSION_CONTEXT_MOCK.storagePath, 'dummy', 'dummy'),
      version: '3.0.0',
      source: 'extension',
    });
  });

  test('should use full stdout when version cannot be parsed', async () => {
    vi.mocked(processApi.exec)
      .mockRejectedValueOnce(new Error('not found'))
      .mockResolvedValueOnce({ stdout: 'unparseable', command: 'version', stderr: '' });

    const info = await cli.getInstalledInfo();
    expect(info.version).toBe('unparseable');
  });
});

describe('installSystemWide', () => {
  test('should use cp with admin privileges on Linux/Mac', async () => {
    Object.defineProperty(envApi, 'isWindows', { value: false, configurable: true });
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(processApi.exec).mockResolvedValue({ stdout: '', command: 'cp', stderr: '' });

    const result = await cli.installSystemWide('/tmp/dummy');
    expect(result).toBe(join('/usr', 'local', 'bin', 'dummy'));
    expect(processApi.exec).toHaveBeenCalledWith('cp', ['/tmp/dummy', join('/usr', 'local', 'bin', 'dummy')], {
      isAdmin: true,
    });
  });

  test('should use copy with quoted paths on Windows', async () => {
    Object.defineProperty(envApi, 'isWindows', { value: true, configurable: true });
    Object.defineProperty(envApi, 'isLinux', { value: false, configurable: true });
    Object.defineProperty(envApi, 'isMac', { value: false, configurable: true });
    vi.mocked(processApi.exec).mockResolvedValue({ stdout: '', command: 'copy', stderr: '' });

    const destPath = join(homedir(), 'AppData', 'Local', 'Microsoft', 'WindowsApps', 'dummy.exe');
    const result = await cli.installSystemWide('C:\\tmp\\dummy.exe');
    expect(result).toBe(destPath);
    expect(processApi.exec).toHaveBeenCalledWith('copy', [`"C:\\tmp\\dummy.exe"`, `"${destPath}"`], {
      isAdmin: true,
    });
  });

  test('should create /usr/local/bin when it does not exist on Linux', async () => {
    Object.defineProperty(envApi, 'isWindows', { value: false, configurable: true });
    Object.defineProperty(envApi, 'isLinux', { value: true, configurable: true });
    vi.mocked(existsSync).mockReturnValue(false);
    vi.mocked(processApi.exec).mockResolvedValue({ stdout: '', command: '', stderr: '' });

    await cli.installSystemWide('/tmp/dummy');

    expect(processApi.exec).toHaveBeenCalledWith('mkdir', ['-p', '/usr/local/bin'], { isAdmin: true });
  });

  test('should rethrow on copy failure', async () => {
    Object.defineProperty(envApi, 'isWindows', { value: false, configurable: true });
    vi.mocked(existsSync).mockReturnValue(true);
    const error = new Error('permission denied');
    vi.mocked(processApi.exec).mockRejectedValue(error);

    await expect(cli.installSystemWide('/tmp/dummy')).rejects.toThrow('permission denied');
  });
});

describe('install system-wide prompt', () => {
  beforeEach(async () => {
    await cli.init();

    vi.mocked(windowApi.showQuickPick).mockResolvedValue({
      label: LIST_RELEASES[0].name,
      tag: LIST_RELEASES[0].tag_name,
      id: LIST_RELEASES[0].id,
    } as GithubReleaseMetadata);
  });

  test('should prompt user for system-wide install', async () => {
    vi.mocked(windowApi.showInformationMessage).mockResolvedValue('Cancel');

    await cli.install(
      { label: 'v1.0.0', tag: 'v1.0.0', id: 0 },
      { logger: LOGGER_MOCK },
    );

    expect(windowApi.showInformationMessage).toHaveBeenCalledWith(
      'Do you want to install dummy system-wide?',
      'Cancel',
      'Confirm',
    );
  });

  test('should install system-wide and use returned path when user confirms', async () => {
    vi.mocked(windowApi.showInformationMessage).mockResolvedValue('Confirm');
    Object.defineProperty(envApi, 'isWindows', { value: false, configurable: true });
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(processApi.exec).mockResolvedValue({ stdout: '', command: 'cp', stderr: '' });

    await cli.install(
      { label: 'v1.0.0', tag: 'v1.0.0', id: 0 },
      { logger: LOGGER_MOCK },
    );

    expect(processApi.exec).toHaveBeenCalledWith(
      'cp',
      expect.arrayContaining([join('/usr', 'local', 'bin', 'dummy')]),
      { isAdmin: true },
    );
    expect(CLI_TOOL_MOCK.updateVersion).toHaveBeenCalledWith(
      expect.objectContaining({
        path: join('/usr', 'local', 'bin', 'dummy'),
      }),
    );
  });

  test('should skip system-wide install when user cancels', async () => {
    vi.mocked(windowApi.showInformationMessage).mockResolvedValue('Cancel');

    await cli.install(
      { label: 'v1.0.0', tag: 'v1.0.0', id: 0 },
      { logger: LOGGER_MOCK },
    );

    expect(CLI_TOOL_MOCK.updateVersion).toHaveBeenCalledWith(
      expect.objectContaining({
        path: join(EXTENSION_CONTEXT_MOCK.storagePath, 'dummy', 'dummy'),
      }),
    );
  });
});

describe('doUninstall system binary removal', () => {
  let installer: CliToolInstaller;

  beforeEach(async () => {
    await cli.init();
    installer = vi.mocked(CLI_TOOL_MOCK.registerInstaller).mock.calls[0][0];
  });

  test('should remove system binary with admin when cliTool.path matches system path', async () => {
    Object.defineProperty(envApi, 'isWindows', { value: false, configurable: true });
    const systemPath = cli.getSystemBinaryPath();
    CLI_TOOL_MOCK.path = systemPath;
    vi.mocked(processApi.exec).mockResolvedValue({ stdout: '', command: 'rm', stderr: '' });

    await installer.doUninstall(LOGGER_MOCK);

    expect(processApi.exec).toHaveBeenCalledWith('rm', [systemPath], { isAdmin: true });
  });

  test('should use del command on Windows for system binary removal', async () => {
    Object.defineProperty(envApi, 'isWindows', { value: true, configurable: true });
    const systemPath = cli.getSystemBinaryPath();
    CLI_TOOL_MOCK.path = systemPath;
    vi.mocked(processApi.exec).mockResolvedValue({ stdout: '', command: 'del', stderr: '' });

    await installer.doUninstall(LOGGER_MOCK);

    expect(processApi.exec).toHaveBeenCalledWith('del', [systemPath], { isAdmin: true });
  });

  test('should not attempt system binary removal when path does not match', async () => {
    CLI_TOOL_MOCK.path = '/some/other/path';
    vi.mocked(processApi.exec).mockResolvedValue({ stdout: '', command: '', stderr: '' });

    await installer.doUninstall(LOGGER_MOCK);

    expect(processApi.exec).not.toHaveBeenCalledWith('rm', expect.anything(), expect.anything());
  });
});
