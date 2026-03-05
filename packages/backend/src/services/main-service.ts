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
import type { ExtensionContext } from '@podman-desktop/api';
import { Disposable } from '@podman-desktop/api';
import type { AsyncInit } from '../utils/async-init';
import { GrypeService } from './grype-service';
import { Octokit } from '@octokit/rest';
import { SyftService } from './syft-service';

export class MainService implements Disposable, AsyncInit<ExtensionContext> {
  #disposables: Disposable[] = [];

  constructor() {}

  protected getOctokit(): Octokit {
    const abortController = new AbortController();
    this.#disposables.push(
      Disposable.create(() => {
        abortController.abort('main dispose');
      }),
    );

    return new Octokit({
      request: {
        signal: abortController.signal,
      },
    });
  }

  async init(context: ExtensionContext): Promise<void> {
    const octokit = this.getOctokit();

    // grype
    const grype: GrypeService = new GrypeService({
      octokit,
      storagePath: context.storagePath,
    });
    await grype.init();
    this.#disposables.push(grype);

    // syft
    const syft: SyftService = new SyftService({
      octokit,
      storagePath: context.storagePath,
    });
    await syft.init();
    this.#disposables.push(syft);
  }

  dispose(): void {
    this.#disposables.forEach(disposable => disposable.dispose());
    this.#disposables = [];
  }
}
