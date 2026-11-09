# Grype Extension for Podman Desktop

This repository contains a Podman Desktop extension integrating [Syft](https://github.com/anchore/syft) and [Grype](https://github.com/anchore/grype) to scan container images and display known security vulnerabilities.

![screenshot](https://github.com/podman-desktop/extension-grype/raw/main/images/grype-image-checker.png)

> ⚠️ Not affiliated with or supported by Anchore.

## Install

You can install the Podman Desktop Grype extension from the extension page and use `ghcr.io/podman-desktop/extension-grype:next`.
See the instruction on [How to install an extension](https://podman-desktop.io/docs/extensions/install)

## End-to-end tests

The Playwright suite installs Grype, checks that it is active, verifies its details page, and removes it during cleanup.
It uses `@podman-desktop/tests-playwright` and an isolated Podman Desktop profile.
CI refreshes the framework to `@next` to match Podman Desktop `main`, as bootc does. The framework is exempt from the
workspace's minimum release age so the Azure runner can install the current nightly package.

Build a local checkout of Podman Desktop before running the tests:

```sh
cd /path/to/podman-desktop
pnpm install --frozen-lockfile
pnpm test:e2e:build
```

Then run the installation tests from this repository:

```sh
pnpm install --frozen-lockfile
pnpm --dir tests/playwright exec playwright install chromium
PODMAN_DESKTOP_ARGS=/path/to/podman-desktop pnpm test:e2e --grep @installation
```

On Windows, set `$env:PODMAN_DESKTOP_ARGS` in PowerShell before running `pnpm test:e2e --grep @installation`.
On Linux, install Xvfb and Playwright's system dependencies with
`pnpm --dir tests/playwright exec playwright install --with-deps chromium`.
A packaged binary built with Electron inspection enabled can be selected with `PODMAN_DESKTOP_BINARY` instead of
`PODMAN_DESKTOP_ARGS`; set only one of these variables.

The default image is `ghcr.io/podman-desktop/extension-grype:next`. Set `OCI_IMAGE` to test another published image.
Run `pnpm test:e2e` to execute the full suite. Reports, traces, and videos are written under
`tests/playwright/tests/output/`; Playwright's per-test artifacts are under `tests/playwright/output/`.

### Test a local container image

PR checks build the repository's `Containerfile`, export the image, and preload its `/extension` directory into the test
profile, following the [bootc PR workflow](https://github.com/podman-desktop/extension-bootc/blob/main/.github/workflows/pr-check.yaml).
To reproduce this locally with Podman running:

```sh
podman build -t localhost/extension-grype:e2e -f Containerfile .
container_id=$(podman create --entrypoint /bin/true localhost/extension-grype:e2e)
podman export --output /tmp/grype-extension.tar "$container_id"
podman rm "$container_id"
mkdir -p tests/playwright/tests/output/grype-tests-pd/plugins
tar -xf /tmp/grype-extension.tar -C tests/playwright/tests/output/grype-tests-pd/plugins
SKIP_INSTALLATION=true PODMAN_DESKTOP_ARGS=/path/to/podman-desktop pnpm test:e2e --grep @installation
```

`SKIP_INSTALLATION=true` preserves the preloaded profile and skips the registry installation step. Activation and details
checks still run and fail if the local extension is missing or cannot activate. Cleanup removes the extension, so export
it again before another run.

### CI workflows

- `pr-check.yaml` calls the reusable `e2e-main.yaml` workflow to build and test the PR's local OCI image on Ubuntu.
- `e2e-main.yaml` also runs after a successful `next-build.yaml` run on `main`. It installs the image tagged with that
  build's commit SHA. Manual runs can select a published image or build from the selected branch.
- `grype-e2e-nightly-windows.yaml` runs the full suite daily at 04:00 UTC on Azure Windows 10 22H2 and Windows 11 23H2
  instances with WSL, using the same MAPT and PDE2E actions as bootc. It installs the published `next` image by default.
  Manual runs can override Podman version, machine settings, and allowlisted test options. Dispatch inputs are validated
  before they reach `$GITHUB_ENV`: only known keys are accepted, `MAPT_IMAGE` is fixed to
  `quay.io/redhat-developer/mapt` (or `vars.MAPT_IMAGE` when that matches), and Podman Desktop / extension forks must
  stay under `podman-desktop`. Pass-path Playwright traces and videos are off by default; set `SAVE_TRACES_ON_PASS=true`
  locally if you need them. Azure uploads keep JUnit, logs, and screenshots (14-day retention).

The Azure workflow requires the repository or organization secrets `ARM_TENANT_ID`, `ARM_SUBSCRIPTION_ID`,
`ARM_CLIENT_ID`, `ARM_CLIENT_SECRET`, and `PODMAN_DESKTOP_BOT_TOKEN`. Optional repository variables `MAPT_IMAGE`,
`MAPT_VERSION_TAG`, `MAPT_CPUS`, `MAPT_MEMORY`, and `MAPT_EXCLUDED_REGIONS` override its provisioning defaults
(`MAPT_IMAGE` must remain `quay.io/redhat-developer/mapt`). Both workflows publish JUnit summaries and upload test
artifacts; the Azure workflow always attempts instance cleanup.
