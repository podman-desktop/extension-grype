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

import type { ExtensionContext as PodmanDesktopExtensionContext, TelemetryLogger } from '@podman-desktop/api';
import { Container } from 'inversify';

import { ExtensionContextSymbol, StartupSymbol, TelemetryLoggerSymbol } from '/@/inject/symbol';
import type { AsyncInit } from '/@/utils/async-init';
import { servicesModule } from '/@/services/services-module';
import type { IAsyncDisposable } from '/@/utils/async-disposable';
import { utilsModule } from '/@/utils/utils-module';

export class InversifyBinding implements AsyncInit<never, Container>, IAsyncDisposable {
  #container: Container | undefined;

  constructor(
    protected extensionContext: PodmanDesktopExtensionContext,
    protected telemetryLogger: TelemetryLogger,
  ) {}

  public async init(): Promise<Container> {
    this.#container = new Container();

    this.#container.bind(ExtensionContextSymbol).toConstantValue(this.extensionContext);
    this.#container.bind(TelemetryLoggerSymbol).toConstantValue(this.telemetryLogger);

    await this.#container.loadAsync(servicesModule);
    await this.#container.loadAsync(utilsModule);

    // instantiate all startup services
    await this.#container?.getAllAsync(StartupSymbol);

    return this.#container;
  }

  async asyncDispose(): Promise<void> {
    if (this.#container) {
      await this.#container.unbindAllAsync();
    }
  }
}
