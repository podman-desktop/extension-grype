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
  containerEngine,
  ExtensionContext,
  ImageInfo,
  ProgressLocation,
  window,
  process,
  type CancellationToken,
  CancellationTokenSource,
} from '@podman-desktop/api';
import { AnchoreCliService } from '/@/services/anchore-cli-service';
import { Octokit } from '@octokit/rest';
import { ExtensionContextSymbol } from '/@/inject/symbol';
import { inject, injectable, postConstruct, preDestroy } from 'inversify';
import { mkdir, mkdtempDisposable, rename } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';

@injectable()
export class SyftService extends AnchoreCliService {
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
    return 'syft.png';
  }
  protected get toolId(): string {
    return 'syft';
  }
  protected get displayName(): string {
    return 'Syft';
  }
  protected get markdownDescription(): string {
    return 'Syft is a powerful open-source tool for generating Software Bills of Materials (SBOMs).';
  }
  protected get repoName(): string {
    return 'syft';
  }

  protected sanitizeImageId(imageId: string): string {
    if (imageId.startsWith('sha256:')) {
      return imageId.substring(7);
    }
    return imageId;
  }

  public async analyse(
    image: ImageInfo,
    options?: {
      token?: CancellationToken;
    },
  ): Promise<string> {
    if (!this.cliTool?.version || !this.cliTool.path)
      throw new Error('cannot analyse image without syft binary installed');

    const cancel = new CancellationTokenSource();
    options?.token?.onCancellationRequested(() => {
      cancel.cancel();
    });
    if (options?.token?.isCancellationRequested)
      throw new Error('cannot analyse image: cancellation has been requested');

    const binary = this.cliTool.path;

    const imageId = this.sanitizeImageId(image.Id);

    const destination = join(this.context.storagePath, image.engineId, `${imageId}.syft.json`);

    // shortcut everything if we have already done the scanning
    if (existsSync(destination)) {
      return destination;
    }

    const imageName = image.RepoTags?.[0] ?? image.Id;
    return window.withProgress(
      {
        location: ProgressLocation.TASK_WIDGET,
        cancellable: true,
        title: `Analysing image ${imageName}`,
      },
      async (progress, token) => {
        if (!this.cliTool?.path) throw new Error('syft is not installed.');

        token.onCancellationRequested(() => {
          cancel.cancel();
        });
        if (token.isCancellationRequested) throw new Error('cannot analyse image: cancellation has been requested');

        // create a tmp directory that will be disposed / removed on function exit
        await using dir = await mkdtempDisposable(join(tmpdir(), image.engineId));
        const tarball = join(dir.path, image.Id);

        progress.report({ message: `Saving image ${imageName}` });
        await containerEngine.saveImage(image.engineId, image.Id, tarball, cancel.token);

        await mkdir(dirname(destination), { recursive: true });

        const tmp = `${destination}.tmp`;

        progress.report({ message: `Analysing image ${imageName}` });
        await process.exec(binary, ['scan', tarball, `--output=json=${tmp}`], {
          token: cancel.token,
        });
        await rename(tmp, destination);

        return destination;
      },
    );
  }
}
