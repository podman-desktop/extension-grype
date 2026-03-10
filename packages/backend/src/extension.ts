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
import { MainService } from '/@/services/main-service';
import type { ExtensionContext } from '@podman-desktop/api';
import type { GrypeExtensionApi } from '@podman-desktop/grype-extension-api';

let main: MainService | undefined;

// Initialize the activation of the extension.
export async function activate(context: ExtensionContext): Promise<GrypeExtensionApi> {
  main = new MainService();
  return main.init(context);
}

export async function deactivate(): Promise<void> {
  try {
    await main?.asyncDispose();
  } catch (err: unknown) {
    console.error('Something went wrong while deactivating the grype extension', err);
  } finally {
    main = undefined;
  }
}
