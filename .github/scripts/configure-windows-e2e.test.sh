#!/usr/bin/env bash
#
# Copyright (C) 2026 Red Hat, Inc.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
# http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
#
# SPDX-License-Identifier: Apache-2.0
#
# Smoke tests for configure-windows-e2e.sh reject/accept paths.
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIGURE="$SCRIPT_DIR/configure-windows-e2e.sh"
failures=0

assert_exit() {
  local name="$1"
  local expected="$2"
  shift 2
  set +e
  local output
  output="$("$@" 2>&1)"
  local actual=$?
  set -e
  if [[ "$actual" -ne "$expected" ]]; then
    echo "FAIL $name: expected exit $expected, got $actual" >&2
    echo "$output" >&2
    failures=$((failures + 1))
    return
  fi
  echo "PASS $name"
}

with_defaults() {
  export NPM_TARGET='test:e2e'
  export ENV_VARS='CI=true,TEST_PODMAN_MACHINE=true,ELECTRON_ENABLE_INSPECT=true'
  export PODMAN_PROVIDER='wsl'
  export PODMAN_URL='https://example.com/podman.msi'
  export PDE2E_IMAGE_VERSION='v0.0.3'
  export PD_REPO_ARGS='REPO=podman-desktop,FORK=podman-desktop,BRANCH=main'
  export EXT_TESTS_OPTIONS='EXT_RUN_TESTS_FROM_EXTENSION=1'
  export PODMAN_OPTIONS='INIT=1,START=1,ROOTFUL=1,NETWORKING=0'
  export EXT_REPO_OPTIONS='REPO=extension-grype,FORK=podman-desktop,BRANCH=main'
  export MAPT_PARAMS=''
  export MAPT_IMAGE='quay.io/redhat-developer/mapt'
  export MAPT_VERSION_TAG='v0.9.8'
  export MAPT_CPUS='8'
  export MAPT_MEMORY='32'
  export MAPT_EXCLUDED_REGIONS='westindia'
  export GITHUB_ENV
  GITHUB_ENV="$(mktemp)"
}

run_configure() {
  bash "$CONFIGURE"
}

with_defaults
assert_exit 'accepts defaults' 0 run_configure

with_defaults
export PD_REPO_ARGS='REPO=podman-desktop,FORK=podman-desktop,BRANCH=main,REPO=evil'
assert_exit 'rejects duplicate CSV key' 1 run_configure

with_defaults
export PD_REPO_ARGS='REPO=podman-desktop,FORK=podman-desktop'
assert_exit 'rejects missing PD_BRANCH' 1 run_configure

with_defaults
export EXT_TESTS_OPTIONS=''
assert_exit 'rejects missing EXT_RUN_TESTS_FROM_EXTENSION' 1 run_configure

with_defaults
export EXT_TESTS_OPTIONS='EXT_RUN_TESTS_FROM_EXTENSION=2'
assert_exit 'rejects invalid EXT_RUN_TESTS_FROM_EXTENSION' 1 run_configure

with_defaults
export EXT_TESTS_OPTIONS='EXT_RUN_TESTS_FROM_EXTENSION=1,NODE_OPTIONS=hack'
assert_exit 'rejects non-allowlisted ext test key' 1 run_configure

with_defaults
export EXT_REPO_OPTIONS='REPO=extension-grype,FORK=evil-fork,BRANCH=main'
assert_exit 'rejects untrusted EXT_FORK' 1 run_configure

with_defaults
export NPM_TARGET=$'test:e2e\nNODE_OPTIONS=hack'
assert_exit 'rejects newline in NPM_TARGET' 1 run_configure

with_defaults
export MAPT_PARAMS='VERSION_TAG=v1;VERSION_TAG=v2'
assert_exit 'rejects duplicate MAPT key' 1 run_configure

with_defaults
export MAPT_PARAMS='IMAGE=ghcr.io/attacker/evil;VERSION_TAG=v9.9.9'
assert_exit 'ignores MAPT IMAGE and accepts VERSION_TAG' 0 run_configure
if ! grep -q $'MAPT_IMAGE<<EOF\nquay.io/redhat-developer/mapt\nEOF' "$GITHUB_ENV"; then
  echo "FAIL MAPT IMAGE should stay allowlisted" >&2
  failures=$((failures + 1))
else
  echo "PASS MAPT IMAGE stays allowlisted"
fi
if ! grep -q $'MAPT_VERSION_TAG<<EOF\nv9.9.9\nEOF' "$GITHUB_ENV"; then
  echo "FAIL MAPT VERSION_TAG override missing" >&2
  failures=$((failures + 1))
else
  echo "PASS MAPT VERSION_TAG override applied"
fi

with_defaults
export PD_REPO='attacker'
export PD_REPO_ARGS='REPO=podman-desktop,FORK=podman-desktop,BRANCH=feature/x'
assert_exit 'clears inherited PD_REPO before parse' 0 run_configure
if ! grep -q $'PD_REPO<<EOF\npodman-desktop\nEOF' "$GITHUB_ENV"; then
  echo "FAIL inherited PD_REPO was not overwritten" >&2
  failures=$((failures + 1))
else
  echo "PASS inherited PD_REPO cleared"
fi

if [[ "$failures" -ne 0 ]]; then
  echo "$failures configure-windows-e2e test(s) failed" >&2
  exit 1
fi

echo "All configure-windows-e2e tests passed"
