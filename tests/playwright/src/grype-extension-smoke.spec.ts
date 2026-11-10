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

import { expect, ExtensionState, RunnerOptions, test } from '@podman-desktop/tests-playwright';

const extensionName = 'grype';
const extensionLabel = 'podman-desktop.grype';
const extensionHeading = 'Grype';
const extensionImage = process.env.OCI_IMAGE ?? 'ghcr.io/podman-desktop/extension-grype:next';
// Opt in locally with SAVE_TRACES_ON_PASS=true. Keep off in CI by default.
const saveArtifactsOnPass = process.env.SAVE_TRACES_ON_PASS === 'true';

test.use({
  runnerOptions: new RunnerOptions({
    customFolder: 'grype-tests-pd',
    customOutputFolder: 'tests/output',
    autoUpdate: false,
    autoCheckUpdates: false,
    saveTracesOnPass: saveArtifactsOnPass,
    saveVideosOnPass: saveArtifactsOnPass,
  }),
});

test.beforeAll(async ({ runner, welcomePage, navigationBar }) => {
  runner.setVideoAndTraceName('grype-extension-smoke');
  await welcomePage.handleWelcomePage(true);
  await expect(welcomePage.skipOnBoarding).toBeHidden();
  const dashboardPage = await navigationBar.openDashboard();
  await expect(dashboardPage.heading).toBeVisible();
});

test.afterAll(async ({ navigationBar }) => {
  const extensionsPage = await navigationBar.openExtensions();
  if (await extensionsPage.extensionIsInstalled(extensionLabel)) {
    const details = await extensionsPage.openExtensionDetails(extensionName, extensionLabel, extensionHeading);
    await details.removeExtension();
    await navigationBar.openExtensions();
    await expect.poll(() => extensionsPage.extensionIsInstalled(extensionLabel), { timeout: 30_000 }).toBeFalsy();
  }
});

// Playwright runs this hook even if cleanup fails, after recording the failure
// so runner.close() retains its diagnostic artifacts.
test.afterAll(async ({ runner }) => {
  await runner.close();
});

test.describe.serial('Grype extension installation', { tag: ['@smoke', '@installation'] }, () => {
  test('Install Grype from an OCI image', async ({ navigationBar }) => {
    // eslint-disable-next-line sonarjs/no-skipped-tests -- PRs preload the image; the next tests must still verify it.
    test.skip(process.env.SKIP_INSTALLATION === 'true', 'The workflow preloads the locally built OCI image');
    const extensionsPage = await navigationBar.openExtensions();
    await expect.poll(() => extensionsPage.extensionIsInstalled(extensionLabel)).toBeFalsy();
    await extensionsPage.installExtensionFromOCIImage(extensionImage);
    const extension = await extensionsPage.getInstalledExtension(extensionName, extensionLabel);
    await expect(extension.card).toBeVisible();
  });

  test('Verify Grype is installed and active', async ({ navigationBar }) => {
    const extensionsPage = await navigationBar.openExtensions();
    await expect.poll(() => extensionsPage.extensionIsInstalled(extensionLabel), { timeout: 60_000 }).toBeTruthy();
    const details = await extensionsPage.openExtensionDetails(extensionName, extensionLabel, extensionHeading);
    await expect(details.heading).toBeVisible();
    await expect(details.status).toHaveText(ExtensionState.Installed, { timeout: 60_000 });
    const errorTab = details.tabs.getByRole('button', { name: 'Error' });
    let stackTrace = '';
    if ((await errorTab.count()) > 0) {
      stackTrace = await errorTab.innerText();
    }
    await expect(errorTab, `Error Tab was present with stackTrace: ${stackTrace}`).not.toBeVisible();
    await expect(details.disableButton).toBeEnabled({ timeout: 60_000 });
  });

  test('Verify Grype extension details', async ({ navigationBar }) => {
    const extensionsPage = await navigationBar.openExtensions();
    const details = await extensionsPage.openExtensionDetails(extensionName, extensionLabel, extensionHeading);
    await expect(details.heading).toBeVisible();
    await expect(details.status).toHaveText(ExtensionState.Installed);
    await expect(details.disableButton).toBeEnabled();
  });
});
