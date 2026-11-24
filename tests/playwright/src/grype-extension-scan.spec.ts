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

import { expect, test } from '@podman-desktop/tests-playwright';
import type { Locator, Page } from '@playwright/test';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import {
  createRunnerOptions,
  extensionHeading,
  extensionImage,
  extensionLabel,
  extensionName,
  preloaded,
  profileFolderName,
  profileOutputFolder,
  removeInstalledExtension,
  startSpec,
} from './spec-utils';

// alpine:3.10 is end-of-life, so its packages (busybox, ssl_client, ...) have known vulnerabilities.
// Images are pulled with their tag but listed in the Images page under their tag-less name.
const vulnerableImage = 'docker.io/library/alpine:3.10';
const vulnerableImageName = 'docker.io/library/alpine';
// hello-world has no packages, so Grype must report no vulnerability for it.
const cleanImage = 'docker.io/library/hello-world:latest';
const cleanImageName = 'docker.io/library/hello-world';

const tools = ['syft', 'grype'];

// The extension stores the binaries it installs under its storage folder in the isolated profile.
const extensionStorageDir = join(
  fileURLToPath(new URL('..', import.meta.url)), // the tests/playwright package root
  profileOutputFolder,
  profileFolderName,
  'extensions-storage',
  extensionLabel,
);

test.use({
  runnerOptions: createRunnerOptions(),
});

test.beforeAll(async ({ runner, welcomePage, navigationBar }) => {
  await startSpec(runner, welcomePage, navigationBar, 'grype-extension-scan');
});

test.afterAll(async ({ navigationBar }) => {
  // Remove the extension only when this spec installed it itself; keep CI's preloaded profile intact.
  if (!preloaded) {
    await removeInstalledExtension(navigationBar);
  }
});

// Runs even if the previous afterAll failed, so runner.close() retains diagnostic artifacts.
test.afterAll(async ({ runner }) => {
  await runner.close();
});

// The message box shown by the extension for window.showInformationMessage calls: a dialog
// named after the extension display name.
function extensionDialog(page: Page): Locator {
  return page.getByRole('dialog', { name: extensionHeading, exact: true });
}

// Status header of the image checks UI ("Image analysis in progress..." / "Image analysis complete").
function analysisStatus(page: Page): Locator {
  return page.getByRole('status', { name: 'Analysis Status' });
}

// Column listing the registered image checker providers.
function providersColumn(page: Page): Locator {
  return page.getByLabel('Providers');
}

// The Grype image checker provider row.
function grypeProviderRow(page: Page): Locator {
  return providersColumn(page).getByRole('row', { name: extensionHeading });
}

// Column listing the analysis results (one row per vulnerability).
function resultRows(page: Page): Locator {
  return page.getByLabel('Analysis Results').getByRole('row');
}

// Severity filter button of the image checks UI, e.g. "High (12)".
function severityFilter(page: Page, severity: string): Locator {
  return page.getByRole('group', { name: 'Severity Filters' }).getByRole('button', { name: severity, exact: false });
}

/** Wait for the binaries installation prompt; undefined when the binaries are already installed on the host. */
async function waitForInstallPrompt(page: Page, timeout: number): Promise<Locator | undefined> {
  const dialog = extensionDialog(page);
  try {
    await dialog.getByText('do you want to install them').waitFor({ state: 'visible', timeout });
  } catch {
    return undefined;
  }
  return dialog;
}

/** Decline the binaries installation prompt; returns false when they are already installed, so the caller can skip. */
async function declineBinariesInstallation(page: Page): Promise<boolean> {
  const dialog = await waitForInstallPrompt(page, 30_000);
  if (!dialog) {
    return false;
  }
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  return true;
}

/**
 * Mirrors the extension's installed detection (AnchoreCliService.getInstalledInfo): a tool counts as
 * installed when a binary is found on the system PATH or in the extension storage and it runs.
 */
async function isToolInstalledOnHost(tool: string): Promise<boolean> {
  const locations: string[] = [];
  try {
    const { stdout } = await promisify(execFile)(process.platform === 'win32' ? 'where' : 'which', [tool]);
    locations.push(...stdout.split(/\r?\n/).filter(line => line.trim() !== ''));
  } catch {
    // not on the system PATH; fall through to the extension storage
  }
  const internal = join(extensionStorageDir, tool, process.platform === 'win32' ? `${tool}.exe` : tool);
  if (existsSync(internal)) {
    locations.push(internal);
  }

  // A binary that cannot run is not installed for the extension either: its version detection fails.
  const runnable = await Promise.all(
    locations.map(location =>
      promisify(execFile)(location, ['--version']).then(
        () => true,
        () => false,
      ),
    ),
  );
  return runnable.some(Boolean);
}

/** Accept the binaries installation prompt and decline the system-wide installs (they need admin rights); promptTimeout bounds the wait for the prompt. */
async function acceptBinariesInstallation(page: Page, promptTimeout = 30_000): Promise<void> {
  const dialog = await waitForInstallPrompt(page, promptTimeout);
  if (!dialog) {
    return; // binaries are already installed
  }

  // install() skips tools that already have a binary, so a system-wide prompt shows up only for the
  // missing ones; waiting for the others would time out (e.g. when the host has only syft or grype).
  // Detect the missing tools before the Yes click: it starts the installs that write the binaries.
  const missing: string[] = [];
  for (const tool of tools) {
    if (!(await isToolInstalledOnHost(tool))) {
      missing.push(tool);
    }
  }

  await dialog.getByRole('button', { name: 'Yes', exact: true }).click();

  for (const tool of missing) {
    const systemWidePrompt = dialog.getByText(`Do you want to install ${tool} system-wide?`);
    await expect(systemWidePrompt).toBeVisible({ timeout: 240_000 });
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  }
}

test.describe.serial('Grype extension vulnerability scanning', { tag: ['@scan'] }, () => {
  test('Install Grype from an OCI image', async ({ navigationBar }) => {
    // eslint-disable-next-line sonarjs/no-skipped-tests -- PRs preload the image; the next tests must still verify it.
    test.skip(preloaded, 'The workflow preloads the locally built OCI image');
    const extensionsPage = await navigationBar.openExtensions();
    await expect.poll(() => extensionsPage.extensionIsInstalled(extensionLabel)).toBeFalsy();
    await extensionsPage.installExtensionFromOCIImage(extensionImage);
    const extension = await extensionsPage.getInstalledExtension(extensionName, extensionLabel);
    await expect(extension.card).toBeVisible();
  });

  test('Declining the binaries installation prompt fails the analysis', async ({ navigationBar, page }) => {
    test.setTimeout(5 * 60_000);
    // Also verifies the preloaded extension when the installation test is skipped.
    const extensionsPage = await navigationBar.openExtensions();
    await expect.poll(() => extensionsPage.extensionIsInstalled(extensionLabel), { timeout: 60_000 }).toBeTruthy();

    const imagesPage = await navigationBar.openImages();
    const pullImagePage = await imagesPage.openPullImage();
    await pullImagePage.pullImage(vulnerableImage);
    await imagesPage.waitForImageExists(vulnerableImageName, 30_000);

    const details = await imagesPage.openImageDetails(vulnerableImageName);
    await details.activateTab('Check');

    const prompted = await declineBinariesInstallation(page);
    if (!prompted) {
      // A missing prompt may also mean a broken extension: require the Grype provider row, so it fails instead of skipping.
      await expect(grypeProviderRow(page)).toBeVisible({ timeout: 30_000 });
    }
    // eslint-disable-next-line sonarjs/no-skipped-tests -- Syft/Grype may already be installed on developer machines.
    test.skip(!prompted, 'Syft/Grype binaries are already installed on the host');

    await expect(analysisStatus(page)).toContainText('Image analysis complete', { timeout: 30_000 });
    await expect(grypeProviderRow(page).getByLabel('Provider Error')).toContainText('user cancelled the installation');
    await expect(resultRows(page)).toHaveCount(0);
  });

  test('Scan an image with known vulnerabilities', async ({ navigationBar, page }) => {
    // Downloading the binaries and the Grype vulnerability database on first use is slow.
    test.setTimeout(15 * 60_000);
    const imagesPage = await navigationBar.openImages();
    const details = await imagesPage.openImageDetails(vulnerableImageName);
    await details.activateTab('Check');

    await acceptBinariesInstallation(page);

    await expect(analysisStatus(page)).toContainText('Image analysis complete', { timeout: 10 * 60_000 });
    await expect(grypeProviderRow(page).getByLabel('Provider Error')).toBeHidden();

    const rows = resultRows(page);
    await expect(rows.first()).toBeVisible();
    const count = await rows.count();
    expect(count, 'Grype should report vulnerabilities for the end-of-life alpine:3.10 image').toBeGreaterThan(0);
    await expect(rows.first()).toContainText('Reported by Grype');
    // The check name is a vulnerability identifier (the row text starts with a space before the icon).
    await expect(rows.first()).toContainText(/^\s*(CVE|GHSA)-/);
    // A failed check is never listed under the "Passed" filter.
    await expect(severityFilter(page, 'Passed')).toContainText('Passed (0)');
  });

  test('Scan an image without vulnerabilities', async ({ navigationBar, page }) => {
    test.setTimeout(10 * 60_000);
    const imagesPage = await navigationBar.openImages();
    const pullImagePage = await imagesPage.openPullImage();
    await pullImagePage.pullImage(cleanImage);
    await imagesPage.waitForImageExists(cleanImageName, 30_000);

    const details = await imagesPage.openImageDetails(cleanImageName);
    await details.activateTab('Check');

    // The previous test already installed the binaries, so wait only shortly for the prompt (still self-contained when run alone).
    await acceptBinariesInstallation(page, 10_000);

    await expect(analysisStatus(page)).toContainText('Image analysis complete', { timeout: 5 * 60_000 });
    await expect(
      page.getByLabel('Analysis Results').getByRole('row', { name: 'No vulnerabilities found' }),
    ).toBeVisible();
    await expect(severityFilter(page, 'Passed')).toContainText('Passed (1)');
  });
});
