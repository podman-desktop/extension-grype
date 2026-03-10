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
import type { Disposable, ImageInfo, CancellationToken, ImageChecks, ImageCheck } from '@podman-desktop/api';
import { imageChecker } from '@podman-desktop/api';
import type { AsyncInit } from '../utils/async-init';
import { SyftService } from './syft-service';
import { GrypeService } from './grype-service';
import { inject, injectable, postConstruct, preDestroy } from 'inversify';

@injectable()
export class ImageCheckerProvider implements Disposable, AsyncInit {
  #disposables: Array<Disposable> = [];

  constructor(
    @inject(SyftService)
    protected syft: SyftService,
    @inject(GrypeService)
    protected grype: GrypeService,
  ) {}

  @preDestroy()
  dispose(): void {
    this.#disposables.forEach(disposable => disposable.dispose());
    this.#disposables = [];
  }

  protected async check(image: ImageInfo, token?: CancellationToken): Promise<ImageChecks | undefined> {
    const file = await this.syft.analyse(image, {
      token,
    });

    const result = await this.grype.analyse(file, {
      token,
    });

    const vulnerabilities: Array<ImageCheck> = result.matches.map(match => ({
      name: match.vulnerability.id,
      status: 'failed',
      severity: match.vulnerability.severity,
      markdownDescription: match.vulnerability.description,
    }));

    return {
      checks:
        vulnerabilities.length > 0
          ? vulnerabilities
          : [
              {
                status: 'success',
                name: 'No vulnerabilities found',
              },
            ],
    };
  }

  @postConstruct()
  async init(): Promise<void> {
    this.#disposables.push(
      imageChecker.registerImageCheckerProvider({
        check: this.check.bind(this),
      }),
    );
  }
}
