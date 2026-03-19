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
  Disposable,
  ImageInfo,
  CancellationToken,
  ImageChecks,
  ImageCheck,
  TelemetryLogger,
} from '@podman-desktop/api';
import { imageChecker } from '@podman-desktop/api';
import type { AsyncInit } from '../utils/async-init';
import { SyftService } from './syft-service';
import { GrypeService } from './grype-service';
import { inject, injectable, postConstruct, preDestroy } from 'inversify';
import { TelemetryLoggerSymbol } from '/@/inject/symbol';
import { TELEMETRY_EVENTS } from '/@/utils/telemetry';

@injectable()
export class ImageCheckerProvider implements Disposable, AsyncInit {
  #disposables: Array<Disposable> = [];

  constructor(
    @inject(SyftService)
    protected syft: SyftService,
    @inject(GrypeService)
    protected grype: GrypeService,
    @inject(TelemetryLoggerSymbol)
    protected readonly telemetryLogger: TelemetryLogger,
  ) {}

  @preDestroy()
  dispose(): void {
    this.#disposables.forEach(disposable => disposable.dispose());
    this.#disposables = [];
  }

  protected async check(image: ImageInfo, token?: CancellationToken): Promise<ImageChecks | undefined> {
    const imageName = image.RepoTags?.[0] ?? image.Id;
    const telemetry: Record<string, unknown> = {};
    const start = performance.now();

    try {
      const file = await this.syft.analyse(image, {
        token,
        task: {
          title: `Analysing image ${imageName}`,
        },
      });

      const result = await this.grype.analyse(file, {
        token,
        task: {
          title: `Scanning SBOM of image ${imageName}`,
        },
      });

      const count = {
        low: 0,
        medium: 0,
        high: 0,
        critical: 0,
        unknown: 0,
      };

      const vulnerabilities: Array<ImageCheck> = result.matches.map(match => {
        count[match.vulnerability.severity ?? 'unknown']++;

        return {
          name: match.vulnerability.id,
          status: 'failed',
          severity: match.vulnerability.severity,
          markdownDescription: match.vulnerability.description,
        };
      });

      telemetry['vulnerabilities-total'] = vulnerabilities.length;
      telemetry['vulnerabilities-low'] = count.low;
      telemetry['vulnerabilities-medium'] = count.medium;
      telemetry['vulnerabilities-high'] = count.high;
      telemetry['vulnerabilities-critical'] = count.critical;
      telemetry['vulnerabilities-unknown'] = count.unknown;

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
    } catch (err: unknown) {
      telemetry['error'] = err;
      throw err;
    } finally {
      telemetry['duration'] = performance.now() - start;
      this.telemetryLogger.logUsage(TELEMETRY_EVENTS.IMAGE_CHECKER, telemetry);
    }
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
