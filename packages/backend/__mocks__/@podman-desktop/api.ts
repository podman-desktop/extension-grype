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
import { vi } from 'vitest';
import type * as podmanDesktopApi from '@podman-desktop/api';
import { devDependencies } from './../../package.json' with { type: 'json' };
import { coerce } from 'semver';

function getVersionExtensionAPIVersion(): string {
  const version = coerce(devDependencies['@podman-desktop/api'])?.version;
  if (!version) throw new Error('cannot find version of @podman-desktop/api');
  return version;
}

const version = getVersionExtensionAPIVersion();

const plugin = {
  EventEmitter: vi.fn(
    class<T> implements podmanDesktopApi.EventEmitter<T> {
      #set: Set<(t: T) => void> = new Set();

      get event(): podmanDesktopApi.Event<T> {
        return listener => {
          this.#set.add(listener);
          return {
            dispose: (): void => {
              this.#set.delete(listener);
            },
          };
        };
      }

      fire(data: T): void {
        this.#set.forEach(listener => listener(data));
      }

      dispose(): void {
        this.#set.clear();
      }
    },
  ),
  ProgressLocation: {
    APP_ICON: 1,
    TASK_WIDGET: 2,
  },
  Disposable: {
    create: (fn: () => void): podmanDesktopApi.Disposable => ({ dispose: fn }),
  } as unknown as typeof podmanDesktopApi.Disposable,
  CancellationTokenSource: vi.fn(),
  Uri: {
    joinPath: vi.fn(),
  } as unknown as typeof podmanDesktopApi.Uri,
  apiVersion: version,
  version: version,
  env: {} as unknown as typeof podmanDesktopApi.env,
  process: {
    exec: vi.fn(),
  } as unknown as typeof podmanDesktopApi.process,
  cli: {
    createCliTool: vi.fn(),
  } as unknown as typeof podmanDesktopApi.cli,
  window: {
    showQuickPick: vi.fn(),
    withProgress: vi.fn(),
  } as unknown as typeof podmanDesktopApi.window,
  navigation: {} as unknown as typeof podmanDesktopApi.navigation,
  commands: {
    registerCommand: vi.fn(),
  } as unknown as typeof podmanDesktopApi.commands,
  extensions: {} as unknown as typeof podmanDesktopApi.extensions,
  provider: {} as unknown as typeof podmanDesktopApi.provider,
  containerEngine: {
    saveImage: vi.fn(),
  } as unknown as typeof podmanDesktopApi.containerEngine,
  configuration: {} as unknown as typeof podmanDesktopApi.configuration,
  authentication: {} as unknown as typeof podmanDesktopApi.authentication,
  context: {} as unknown as typeof podmanDesktopApi.context,
  fs: {} as unknown as typeof podmanDesktopApi.fs,
  imageChecker: {
    registerImageCheckerProvider: vi.fn(),
  } as unknown as typeof podmanDesktopApi.imageChecker,
  kubernetes: {} as unknown as typeof podmanDesktopApi.kubernetes,
  proxy: {} as unknown as typeof podmanDesktopApi.proxy,
  net: {} as unknown as typeof podmanDesktopApi.net,
  QuickPickItemKind: {
    Separator: -1,
    Default: 0,
  },
  InputBoxValidationSeverity: {
    Info: 1,
    Warning: 2,
    Error: 3,
  },
  registry: {} as unknown as typeof podmanDesktopApi.registry,
  RepositoryInfoParser: vi.fn(
    class {
      owner: string;
      repository: string;

      constructor(url: string) {
        const parsed = new URL(url);
        if (parsed.hostname !== 'github.com') throw new Error('only support github');

        const [, org, repo] = parsed.pathname.split('/');
        this.owner = org;
        this.repository = repo;
      }
    },
  ),
  TelemetryTrustedValue: vi.fn(
    class<T> {
      value: T;

      constructor(value: T) {
        this.value = value;
      }
    },
  ),
  tray: {} as unknown as typeof podmanDesktopApi.tray,
  StatusBarAlignLeft: 'LEFT',
  StatusBarAlignRight: 'RIGHT',
  StatusBarItemDefaultPriority: 0,
} as typeof podmanDesktopApi;
module.exports = plugin;
