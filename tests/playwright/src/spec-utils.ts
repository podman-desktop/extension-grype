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

import type { NavigationBar, Runner, WelcomePage } from '@podman-desktop/tests-playwright';
import { expect, RunnerOptions } from '@podman-desktop/tests-playwright';

export const extensionName = 'grype';
export const extensionLabel = 'podman-desktop.grype';
export const extensionHeading = 'Grype';
export const extensionImage = process.env.OCI_IMAGE ?? 'ghcr.io/podman-desktop/extension-grype:next';
// True when CI preloads the extension image (SKIP_INSTALLATION): specs then use the preloaded extension and keep the profile intact for reruns.
export const preloaded = process.env.SKIP_INSTALLATION === 'true';
// Opt in locally with SAVE_TRACES_ON_PASS=true. Keep off in CI by default.
const saveArtifactsOnPass = process.env.SAVE_TRACES_ON_PASS === 'true';

// Isolated Podman Desktop profile location, relative to the tests/playwright package root.
const profileFolderName = 'grype-tests-pd';
const profileOutputFolder = 'tests/output';

export function createRunnerOptions(): RunnerOptions {
  return new RunnerOptions({
    customFolder: profileFolderName,
    customOutputFolder: profileOutputFolder,
    autoUpdate: false,
    autoCheckUpdates: false,
    saveTracesOnPass: saveArtifactsOnPass,
    saveVideosOnPass: saveArtifactsOnPass,
  });
}

/** Common spec bootstrap: name the trace/video, handle the welcome page, check the dashboard renders. */
export async function startSpec(
  runner: Runner,
  welcomePage: WelcomePage,
  navigationBar: NavigationBar,
  traceName: string,
): Promise<void> {
  runner.setVideoAndTraceName(traceName);
  await welcomePage.handleWelcomePage(true);
  await expect(welcomePage.skipOnBoarding).toBeHidden();
  const dashboardPage = await navigationBar.openDashboard();
  await expect(dashboardPage.heading).toBeVisible();
}

/** Remove the extension; call only when the calling spec installed it itself, to keep CI's preloaded profile intact. */
export async function removeInstalledExtension(navigationBar: NavigationBar): Promise<void> {
  const extensionsPage = await navigationBar.openExtensions();
  if (await extensionsPage.extensionIsInstalled(extensionLabel)) {
    const details = await extensionsPage.openExtensionDetails(extensionName, extensionLabel, extensionHeading);
    await details.removeExtension();
    await navigationBar.openExtensions();
    await expect.poll(() => extensionsPage.extensionIsInstalled(extensionLabel), { timeout: 30_000 }).toBeFalsy();
  }
}
