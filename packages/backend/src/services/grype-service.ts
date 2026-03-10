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

import {
  type CancellationToken,
  CancellationTokenSource,
  ExtensionContext,
  ProgressLocation,
  window,
} from '@podman-desktop/api';
import { process } from '@podman-desktop/api';
import { AnchoreCliService } from '/@/services/anchore-cli-service';
import { Octokit } from '@octokit/rest';
import { ExtensionContextSymbol } from '/@/inject/symbol';
import { inject, injectable, postConstruct, preDestroy } from 'inversify';
import { existsSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { readFile } from 'node:fs/promises';
import * as grype from '/@/schemas/grype';

@injectable()
export class GrypeService extends AnchoreCliService {
  constructor(
    @inject(Octokit)
    octokit: Octokit,
    @inject(ExtensionContextSymbol)
    context: ExtensionContext,
  ) {
    super(octokit, context);
  }

  @postConstruct()
  override async init(): Promise<void> {
    return super.init();
  }

  @preDestroy()
  override dispose(): void {
    super.dispose();
  }

  protected override get icon(): string {
    return 'icon.png';
  }
  protected get toolId(): string {
    return 'grype';
  }
  protected get displayName(): string {
    return 'Grype';
  }
  protected get markdownDescription(): string {
    return 'Grype is a vulnerability scanner for container images and filesystems.';
  }
  protected get repoName(): string {
    return 'grype';
  }

  public async analyse(
    sbom: string,
    options?: {
      token?: CancellationToken;
    },
  ): Promise<grype.Document> {
    if (!this.cliTool?.version || !this.cliTool.path)
      throw new Error('cannot analyse sbom without grype binary installed');

    const cancel = new CancellationTokenSource();
    options?.token?.onCancellationRequested(() => {
      cancel.cancel();
    });
    if (options?.token?.isCancellationRequested)
      throw new Error('cannot analyse sbom: cancellation has been requested');

    const binary = this.cliTool.path;

    if (!existsSync(sbom)) throw new Error('cannot analyse without sbom file');

    const dir = dirname(sbom);
    const [name] = basename(sbom).split('.');
    const destination = join(dir, `${name}.grype.json`);

    if (existsSync(destination)) {
      const data = await readFile(destination, 'utf-8');
      return grype.GrypeDocumentSchema.parse(JSON.parse(data));
    }

    return window.withProgress(
      {
        location: ProgressLocation.TASK_WIDGET,
        cancellable: true,
        title: `Analysing sbom`,
      },
      async (_, token) => {
        token.onCancellationRequested(() => {
          cancel.cancel();
        });
        if (token.isCancellationRequested) throw new Error('cannot analyse image: cancellation has been requested');

        await process.exec(binary, [`sbom:${sbom}`, '--output=json', `--file=${destination}`], {
          token: cancel.token,
        });

        const content = await readFile(destination, 'utf-8');
        return grype.GrypeDocumentSchema.parse(JSON.parse(content));
      },
    );
  }
}
