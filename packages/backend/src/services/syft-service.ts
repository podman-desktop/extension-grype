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
import { AnchoreCliService } from '/@/services/anchore-cli-service';
import { Octokit } from '@octokit/rest';
import { ExtensionContextSymbol } from '/@/inject/symbol';
import { inject, injectable, postConstruct, preDestroy } from 'inversify';

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
}
