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
import type { AsyncInit } from '/@/utils/async-init';
import type { CancellationToken } from '@podman-desktop/api';

import type { GrypeExtensionApi } from '@podman-desktop/grype-extension-api';
import { syft, grype } from '@podman-desktop/grype-extension-api';
import { inject, injectable } from 'inversify';
import { GrypeService } from '/@/services/grype-service';
import { SyftService } from '/@/services/syft-service';
import { readFile } from 'node:fs/promises';
import { z } from 'zod';

@injectable()
export class ApiService implements AsyncInit<never, GrypeExtensionApi> {
  constructor(
    @inject(GrypeService)
    private readonly grypeService: GrypeService,
    @inject(SyftService)
    private readonly syftService: SyftService,
  ) {}

  async init(): Promise<GrypeExtensionApi> {
    return {
      sbom: {
        analyse: async (
          image: { engineId: string; Id: string },
          options?: { token?: CancellationToken; task?: { title?: string } },
        ): Promise<syft.Document> => {
          const result = await this.syftService.analyse(image, options);
          const raw = await readFile(result, 'utf-8');

          const { success, data, error } = syft.SyftDocumentSchema.safeParse(JSON.parse(raw));
          if (success) {
            return data;
          } else {
            throw new Error(`cannot parse syft SBOM document: ${z.prettifyError(error)}`);
          }
        },
      },
      vulnerability: {
        analyse: async (
          image: { engineId: string; Id: string },
          options?: { token?: CancellationToken; task?: { title?: string } },
        ): Promise<grype.Document> => {
          const result = await this.syftService.analyse(image, options);
          return this.grypeService.analyse(result, options);
        },
      },
    };
  }
}
