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
import { inject, injectable, postConstruct, preDestroy } from 'inversify';
import { ExtensionContextSymbol } from '/@/inject/symbol';
import { commands, Disposable, ExtensionContext, ProgressLocation, window } from '@podman-desktop/api';
import { join } from 'node:path';
import { rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { AsyncInit } from '/@/utils/async-init';

@injectable()
export class CacheService implements Disposable, AsyncInit {
  #disposables: Disposable[] = [];

  constructor(
    @inject(ExtensionContextSymbol)
    protected readonly context: ExtensionContext,
  ) {}

  public getCacheDirectory(): string {
    return join(this.context.storagePath, 'cache');
  }

  protected async clearCache(): Promise<void> {
    await window.withProgress(
      {
        location: ProgressLocation.TASK_WIDGET,
        title: 'Grype: clearing cache',
      },
      async () => {
        const cache = this.getCacheDirectory();
        if (existsSync(cache)) {
          await rm(cache, { recursive: true });
        }
      },
    );
  }

  @postConstruct()
  async init(): Promise<void> {
    this.#disposables.push(commands.registerCommand('grype:clear-cache', this.clearCache.bind(this)));
  }

  @preDestroy()
  dispose(): void {
    this.#disposables.forEach(disposable => disposable.dispose());
  }
}
