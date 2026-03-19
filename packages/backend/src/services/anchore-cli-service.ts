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

import type {
  CliTool,
  Disposable,
  ExtensionContext,
  Logger,
  QuickPickItem,
  TelemetryLogger,
} from '@podman-desktop/api';
import { cli as cliApi, env as envApi, process as processApi, window as windowApi } from '@podman-desktop/api';
import type { AsyncInit } from '/@/utils/async-init';
import type { Octokit } from '@octokit/rest';
import { arch as nodeArch, platform as nodePlatform } from 'node:process';
import { join } from 'node:path';
import AdmZip from 'adm-zip';
import * as tar from 'tar';
import { chmod, mkdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { TELEMETRY_EVENTS } from '/@/utils/telemetry';

export interface GithubReleaseMetadata extends QuickPickItem {
  tag: string;
  id: number;
}

export const ANCHORE_GITHUB_ORG = 'anchore';

export abstract class AnchoreCliService implements Disposable, AsyncInit {
  protected cliTool?: CliTool;

  constructor(
    protected octokit: Octokit,
    protected context: ExtensionContext,
    protected telemetryLogger: TelemetryLogger,
  ) {}

  // Abstracts to be provided by concrete tools
  protected abstract get toolId(): string; // e.g. 'syft' | 'grype'
  protected abstract get displayName(): string; // e.g. 'Syft'
  protected abstract get markdownDescription(): string;
  protected abstract get repoName(): string; // e.g. 'syft' | 'grype'
  protected abstract get icon(): string;

  protected get storageDir(): string {
    return join(this.context.storagePath, this.toolId);
  }

  protected get binaryBaseName(): string {
    return this.toolId;
  }

  protected get binaryPath(): string {
    return join(this.storageDir, envApi.isWindows ? `${this.binaryBaseName}.exe` : this.binaryBaseName);
  }

  dispose(): void {
    this.cliTool?.dispose();
  }

  protected async getInstalledVersion(): Promise<string> {
    // default parse: '<tool> <semver>' from '--version'
    const { stdout } = await processApi.exec(this.binaryPath, ['--version']);
    // example: 'syft 1.41.2' or 'grype 0.109.0'
    const text = stdout.trim();
    const [, version] = text.split(/\s+/);
    return version ?? text;
  }

  async init(): Promise<void> {
    let version: string | undefined;

    if (existsSync(this.binaryPath)) {
      try {
        version = await this.getInstalledVersion();
      } catch (err) {
        console.warn('Unable to determine installed version', err);
        // if unable to determine version, keep undefined and let user reinstall
        version = undefined;
      }
    }

    // Ensure tool-specific storage folder exists early
    await mkdir(this.storageDir, { recursive: true });

    this.cliTool = cliApi.createCliTool({
      name: this.toolId,
      displayName: this.displayName,
      markdownDescription: this.markdownDescription,
      images: {
        icon: this.icon,
        logo: this.icon,
      },
      version,
      installationSource: 'extension',
      path: version ? this.binaryPath : undefined,
    });

    let selected: GithubReleaseMetadata | undefined = undefined;
    this.cliTool.registerInstaller({
      doUninstall(_: Logger): Promise<void> {
        // We could remove the binary and keep cache; keep not implemented for now
        throw new Error('Not implemented');
      },
      doInstall: async (logger: Logger) => {
        if (!selected) throw new Error('No version selected');

        const telemetry: Record<string, unknown> = {
          toolId: this.toolId,
          tag: selected.tag,
        };
        const start = performance.now();

        try {
          const assetPath = await this.download(selected);
          logger.log(`Downloaded ${this.toolId} to ${assetPath}`);

          try {
            const binPath = await this.extract(assetPath, this.storageDir);
            logger.log(`Extracted ${this.toolId} to ${binPath}`);

            this.cliTool?.updateVersion({
              version: selected.tag.slice(1),
              path: binPath,
              installationSource: 'extension',
            });
          } finally {
            await rm(assetPath).catch(() => undefined);
          }
        } catch (err: unknown) {
          telemetry['error'] = err;
          throw err;
        } finally {
          telemetry['duration'] = performance.now() - start;
          this.telemetryLogger.logUsage(TELEMETRY_EVENTS.CLI_INSTALL, telemetry);
        }
      },
      selectVersion: async (_?: boolean) => {
        const current = version; // already resolved above
        selected = await this.promptUserForVersion(current ? `v${current}` : undefined);
        return selected.tag.slice(1);
      },
    });
  }

  protected async listReleases(limits = 10): Promise<GithubReleaseMetadata[]> {
    const lastReleases = await this.octokit.repos.listReleases({
      owner: ANCHORE_GITHUB_ORG,
      repo: this.repoName,
    });

    // keep only releases and not pre-releases
    lastReleases.data = lastReleases.data.filter(release => !release.prerelease);

    if (lastReleases.data.length > limits) {
      lastReleases.data = lastReleases.data.slice(0, limits);
    }

    return lastReleases.data.map(release => {
      return {
        label: release.name ?? release.tag_name,
        tag: release.tag_name,
        id: release.id,
      } satisfies GithubReleaseMetadata;
    });
  }

  protected async promptUserForVersion(currentTagVersion?: string): Promise<GithubReleaseMetadata> {
    // Get the latest releases
    let lastReleasesMetadata = await this.listReleases();
    // if the user already has an installed version, we remove it from the list
    if (currentTagVersion) {
      lastReleasesMetadata = lastReleasesMetadata.filter(release => release.tag !== currentTagVersion);
    }

    // if only one return it directly
    if (lastReleasesMetadata.length === 1) return lastReleasesMetadata[0];

    // Show the quickpick
    const selectedRelease = await windowApi.showQuickPick(lastReleasesMetadata, {
      placeHolder: `Select ${this.displayName} version to download`,
    });

    if (selectedRelease) {
      return selectedRelease;
    } else {
      throw new Error('No version selected');
    }
  }

  protected async download(release: GithubReleaseMetadata): Promise<string> {
    const { data } = await this.octokit.repos.listReleaseAssets({
      owner: ANCHORE_GITHUB_ORG,
      repo: this.repoName,
      release_id: release.id,
    });

    const assetName = this.getAssetName(release.tag.slice(1));

    const asset = data.find(a => assetName === a.name);
    if (!asset) throw new Error(`asset ${assetName} not found`);

    const response = await this.octokit.repos.getReleaseAsset({
      owner: ANCHORE_GITHUB_ORG,
      repo: this.repoName,
      asset_id: asset.id,
      headers: { accept: 'application/octet-stream' },
    });

    await mkdir(this.storageDir, { recursive: true });

    // write the file into the tool-specific dir
    const destination = join(this.storageDir, asset.name);
    await writeFile(destination, Buffer.from(response.data as unknown as ArrayBuffer));

    return destination;
  }

  protected async extract(archivePath: string, destDir: string): Promise<string> {
    if (archivePath.endsWith('.zip')) {
      const zip = new AdmZip(archivePath);
      // eslint-disable-next-line sonarjs/no-unsafe-unzip
      zip.extractAllTo(destDir, true);
    } else if (archivePath.endsWith('.tar.gz')) {
      // eslint-disable-next-line sonarjs/no-unsafe-unzip
      await tar.x({ file: archivePath, cwd: destDir });
    } else {
      throw new Error(`Unsupported archive format: ${archivePath}`);
    }

    const binaryName = envApi.isWindows ? `${this.binaryBaseName}.exe` : this.binaryBaseName;
    const binaryPath = join(destDir, binaryName);

    if (!envApi.isWindows) {
      // eslint-disable-next-line sonarjs/file-permissions
      await chmod(binaryPath, 0o755);
    }

    return binaryPath;
  }

  protected getAssetName(version: string): string {
    let os: string;
    let extension = 'tar.gz';

    const platform = nodePlatform;
    switch (platform) {
      case 'win32':
        os = 'windows';
        extension = 'zip';
        break;
      case 'darwin':
        os = 'darwin';
        break;
      case 'linux':
      default:
        os = 'linux';
        break;
    }

    let architecture: string;
    const arch = nodeArch;
    switch (arch) {
      case 'x64':
        architecture = 'amd64';
        break;
      case 'arm64':
        architecture = 'arm64';
        break;
      case 'ppc64':
        architecture = 'ppc64le';
        break;
      case 's390x':
        architecture = 's390x';
        break;
      default:
        architecture = arch;
        break;
    }

    return `${this.binaryBaseName}_${version}_${os}_${architecture}.${extension}`;
  }
}
