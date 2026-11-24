# Grype Extension for Podman Desktop

This repository contains a Podman Desktop extension integrating [Syft](https://github.com/anchore/syft) and [Grype](https://github.com/anchore/grype) to scan container images and display known security vulnerabilities.

![screenshot](https://github.com/podman-desktop/extension-grype/raw/main/images/grype-image-checker.png)

> ⚠️ Not affiliated with or supported by Anchore.

## Install

You can install the Podman Desktop Grype extension from the extension page and use `ghcr.io/podman-desktop/extension-grype:next`.
See the instruction on [How to install an extension](https://podman-desktop.io/docs/extensions/install)

## End-to-end tests

The Playwright suite covers two areas, each in its own spec file:

- **Installation smoke tests** (`@installation`, `grype-extension-smoke.spec.ts`): install Grype, check that it is
  active, verify its details page, and remove it during cleanup.
- **Vulnerability scanning tests** (`@scan`, `grype-extension-scan.spec.ts`): pull images with and without known
  vulnerabilities, run the image analysis from the image details _Check_ tab (including the Syft/Grype binaries
  installation prompted by the extension), and assert the reported vulnerabilities. The installation dialogs are
  handled by an outcome-driven polling loop (whichever dialog is up gets answered until the analysis completes), so
  the tests do not depend on a fixed prompt order. The first scan downloads the binaries and the Grype vulnerability
  database, so it is slow; the tests use extended timeouts accordingly.

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
Set only one of `PODMAN_DESKTOP_BINARY` / `PODMAN_DESKTOP_ARGS`. On macOS, prefer `PODMAN_DESKTOP_ARGS` or a
[testing-enabled binary](https://github.com/podman-desktop/testing-prereleases): Playwright cannot attach to the
retail `Podman Desktop.app` because its hardened runtime strips the environment variables the Electron driver
needs.

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
checks still run and fail if the local extension is missing or cannot activate. The preloaded extension is left installed,
so reruns reuse it (delete the profile under `tests/playwright/tests/output/grype-tests-pd/` to force a fresh start).
Without `SKIP_INSTALLATION`, cleanup removes the extension the spec installed itself.

### CI workflows

- `pr-check.yaml` calls reusable `e2e.yaml` to build and preload the local OCI image on Ubuntu 26.04, install Podman
  Desktop via `podman-desktop/gh-extensions-actions`, and run the e2e tests (installation smoke plus vulnerability
  scanning) on GitHub-hosted `ubuntu-26.04` and `windows-2025` runners (same matrix pattern as
  [extension-podman-quadlet](https://github.com/podman-desktop/extension-podman-quadlet/blob/main/.github/workflows/e2e.yaml)).
  The runners also run Docker, which Podman Desktop may pick for pulls (breaking them in different ways
  per OS), so the workflow stops Docker and starts the Podman socket before the tests to make Podman
  the only container engine.
- The same workflow also runs after a successful `next-build.yaml` on `main`. It installs the image `next-build` tags
  with that build's commit SHA (pushed alongside `:next`), and skips the job if `main` has already moved past that
  commit so the tests stay aligned with the tested image; it never builds an extension of its own on that path.
  Manual runs (and reusable-workflow callers) can select any published image tag via the `extension-tag` input —
  `next` by default, e.g. `0.3.0` or a full 40-character commit SHA — or build from the selected branch.

Both paths publish JUnit summaries and upload per-OS test artifacts. Pass-path Playwright traces and videos are off by
default; set `SAVE_TRACES_ON_PASS=true` locally if you need them.
