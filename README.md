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
CI refreshes the framework to `@next` to match Podman Desktop `main`. The framework is exempt from the workspace's
minimum release age so CI can install the current nightly package.

CI installs a Podman Desktop production binary via the shared `podman-desktop-install` action. Locally you can either
point at a Podman Desktop checkout or a packaged binary:

```sh
pnpm install --frozen-lockfile
pnpm --dir tests/playwright exec playwright install chromium
PODMAN_DESKTOP_BINARY=/path/to/podman-desktop pnpm test:e2e --grep @installation
```

Or build from a Podman Desktop source checkout:

```sh
cd /path/to/podman-desktop
pnpm install --frozen-lockfile
pnpm test:e2e:build
cd /path/to/extension-grype
PODMAN_DESKTOP_ARGS=/path/to/podman-desktop pnpm test:e2e --grep @installation
```

On Windows, set `$env:PODMAN_DESKTOP_ARGS` or `$env:PODMAN_DESKTOP_BINARY` in PowerShell before running the tests.
On Linux, install Xvfb and Playwright's system dependencies with
`pnpm --dir tests/playwright exec playwright install --with-deps chromium`.
Set only one of `PODMAN_DESKTOP_BINARY` / `PODMAN_DESKTOP_ARGS`.

The default image is `ghcr.io/podman-desktop/extension-grype:next`. Set `OCI_IMAGE` to test another published image.
Run `pnpm test:e2e` to execute the full suite. Reports, traces, and videos are written under
`tests/playwright/tests/output/`; Playwright's per-test artifacts are under `tests/playwright/output/`.

### Test a local container image

PR checks build the repository's `Containerfile`, export `/extension`, and preload it into the test profile (same pattern
as [quadlet](https://github.com/podman-desktop/extension-podman-quadlet/blob/main/.github/workflows/e2e.yaml) /
[crc](https://github.com/crc-org/crc-extension/blob/main/.github/workflows/e2e.yml)). To reproduce locally with Podman
running:

```sh
podman build -t localhost/local_image ./
container_id=$(podman create --entrypoint /bin/true localhost/local_image)
mkdir -p tests/playwright/tests/output/grype-tests-pd/plugins
podman export "$container_id" | tar -x -C tests/playwright/tests/output/grype-tests-pd/plugins
podman rm "$container_id"
SKIP_INSTALLATION=true PODMAN_DESKTOP_BINARY=/path/to/podman-desktop pnpm test:e2e --grep @installation
```

`SKIP_INSTALLATION=true` preserves the preloaded profile and skips the registry installation step. Activation and details
checks still run and fail if the local extension is missing or cannot activate. Cleanup removes the extension, so export
it again before another run.

### CI workflows

- `pr-check.yaml` calls reusable `e2e.yaml` to build and preload the local OCI image on Ubuntu 26.04, install Podman
  Desktop via `podman-desktop/gh-extensions-actions`, and run the installation smoke tests.
- The same workflow also runs after a successful `next-build.yaml` on `main`. It installs the image tagged with that
  build's commit SHA, and skips the job if `main` has already moved past that commit so tests stay aligned with the
  image. Manual runs can select a published image or build from the selected branch.

Both paths publish JUnit summaries and upload test artifacts. Pass-path Playwright traces and videos are off by default;
set `SAVE_TRACES_ON_PASS=true` locally if you need them.
