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
# Validate workflow_dispatch / schedule inputs and write allowlisted values to
# $GITHUB_ENV for the Windows Azure nightly job. Required env vars are supplied
# by the calling workflow step.
#
set -euo pipefail

if [[ -z "${GITHUB_ENV:-}" ]]; then
  echo "GITHUB_ENV must be set" >&2
  exit 1
fi

write_env() {
  local name="$1"
  local value="$2"
  case "$value" in
    *$'\n'* | *$'\r'*)
      echo "Refusing newline/control characters in $name" >&2
      exit 1
      ;;
  esac
  # Values are already newline-free; use NAME=VALUE so a value of "EOF" cannot
  # collide with a heredoc delimiter and break the runner env file parser.
  echo "${name}=${value}" >>"$GITHUB_ENV"
}

require_match() {
  local name="$1"
  local value="$2"
  local pattern="$3"
  if [[ ! "$value" =~ $pattern ]]; then
    echo "Invalid $name='$value' (expected /$pattern/)" >&2
    exit 1
  fi
}

# Parse KEY=value bags into allowlisted names. Optional env-name prefix (e.g. PD_, EXT_).
parse_allowlisted_csv() {
  local input="$1"
  local prefix="$2"
  shift 2
  local -a allow=("$@")
  local IFS=','
  # shellcheck disable=SC2206
  local -a pairs=($input)
  local pair key value allowed found env_name
  local seen=','
  for pair in "${pairs[@]}"; do
    [[ -z "$pair" ]] && continue
    key="${pair%%=*}"
    value="${pair#*=}"
    if [[ "$key" == "$pair" ]]; then
      echo "Expected KEY=value in '$pair'" >&2
      exit 1
    fi
    found=0
    for allowed in "${allow[@]}"; do
      if [[ "$key" == "$allowed" ]]; then
        found=1
        break
      fi
    done
    if [[ "$found" -ne 1 ]]; then
      echo "Refusing non-allowlisted key '$key' (allowed: ${allow[*]})" >&2
      exit 1
    fi
    if [[ "$seen" == *",$key,"* ]]; then
      echo "Refusing duplicate key '$key'" >&2
      exit 1
    fi
    seen+="$key,"
    env_name="${prefix}${key}"
    # Keep the exact value for validation, including any embedded '=' characters.
    printf -v "$env_name" '%s' "$value"
    write_env "$env_name" "$value"
  done
}

require_match NPM_TARGET "$NPM_TARGET" '^test(:[A-Za-z0-9._-]+)*$'
require_match PODMAN_PROVIDER "$PODMAN_PROVIDER" '^(wsl|hyperv)$'
require_match PDE2E_IMAGE_VERSION "$PDE2E_IMAGE_VERSION" '^[A-Za-z0-9._-]+$'
require_match MAPT_IMAGE "$MAPT_IMAGE" '^quay\.io/redhat-developer/mapt$'
require_match MAPT_VERSION_TAG "$MAPT_VERSION_TAG" '^[A-Za-z0-9._-]+$'
require_match MAPT_CPUS "$MAPT_CPUS" '^[0-9]+$'
require_match MAPT_MEMORY "$MAPT_MEMORY" '^[0-9]+$'

write_env NPM_TARGET "$NPM_TARGET"
write_env PODMAN_PROVIDER "$PODMAN_PROVIDER"
write_env PODMAN_URL "$PODMAN_URL"
write_env PDE2E_IMAGE_VERSION "$PDE2E_IMAGE_VERSION"
write_env MAPT_IMAGE "$MAPT_IMAGE"
write_env MAPT_VERSION_TAG "$MAPT_VERSION_TAG"
write_env MAPT_CPUS "$MAPT_CPUS"
write_env MAPT_MEMORY "$MAPT_MEMORY"
write_env MAPT_EXCLUDED_REGIONS "$MAPT_EXCLUDED_REGIONS"

# Missing fields must fail validation even if inherited from the environment.
PD_REPO=''
PD_FORK=''
PD_BRANCH=''
EXT_REPO=''
EXT_FORK=''
EXT_BRANCH=''
EXT_RUN_TESTS_FROM_EXTENSION=''

parse_allowlisted_csv "$PD_REPO_ARGS" 'PD_' REPO FORK BRANCH
parse_allowlisted_csv "$EXT_REPO_OPTIONS" 'EXT_' REPO FORK BRANCH
parse_allowlisted_csv "$EXT_TESTS_OPTIONS" '' EXT_RUN_TESTS_FROM_EXTENSION
parse_allowlisted_csv "$PODMAN_OPTIONS" 'PODMAN_' INIT START ROOTFUL NETWORKING
parse_allowlisted_csv "$ENV_VARS" '' CI TEST_PODMAN_MACHINE ELECTRON_ENABLE_INSPECT

# Enforce trusted org/repos so secret-bearing steps never follow attacker forks.
require_match PD_REPO "${PD_REPO:-}" '^podman-desktop$'
require_match PD_FORK "${PD_FORK:-}" '^podman-desktop$'
require_match PD_BRANCH "${PD_BRANCH:-}" '^[A-Za-z0-9._/-]+$'
require_match EXT_REPO "${EXT_REPO:-}" '^extension-grype$'
require_match EXT_FORK "${EXT_FORK:-}" '^podman-desktop$'
require_match EXT_BRANCH "${EXT_BRANCH:-}" '^[A-Za-z0-9._/-]+$'
require_match EXT_RUN_TESTS_FROM_EXTENSION "${EXT_RUN_TESTS_FROM_EXTENSION:-}" '^[01]$'

# MAPT_PARAMS may override VERSION_TAG/CPUS/MEMORY/EXCLUDED_REGIONS only — never IMAGE.
if [[ -n "${MAPT_PARAMS:-}" ]]; then
  IFS=';'
  # shellcheck disable=SC2206
  mapt_pairs=($MAPT_PARAMS)
  unset IFS
  local_seen=','
  for pair in "${mapt_pairs[@]}"; do
    pair="${pair//\"/}"
    [[ -z "$pair" ]] && continue
    key="${pair%%=*}"
    value="${pair#*=}"
    if [[ "$key" == "$pair" ]]; then
      echo "Expected KEY=value in MAPT_PARAMS '$pair'" >&2
      exit 1
    fi
    if [[ "$local_seen" == *",$key,"* ]]; then
      echo "Refusing duplicate MAPT key '$key'" >&2
      exit 1
    fi
    local_seen+="$key,"
    case "$key" in
      IMAGE)
        echo "Ignoring MAPT IMAGE override; using allowlisted MAPT_IMAGE=$MAPT_IMAGE" >&2
        ;;
      VERSION_TAG)
        require_match MAPT_VERSION_TAG "$value" '^[A-Za-z0-9._-]+$'
        write_env MAPT_VERSION_TAG "$value"
        ;;
      CPUS)
        require_match MAPT_CPUS "$value" '^[0-9]+$'
        write_env MAPT_CPUS "$value"
        ;;
      MEMORY)
        require_match MAPT_MEMORY "$value" '^[0-9]+$'
        write_env MAPT_MEMORY "$value"
        ;;
      EXCLUDED_REGIONS)
        write_env MAPT_EXCLUDED_REGIONS "$value"
        ;;
      *)
        echo "Refusing non-allowlisted MAPT key '$key'" >&2
        exit 1
        ;;
    esac
  done
fi

# ENV_VARS is consumed as a single comma-separated bag by downstream actions.
write_env ENV_VARS "$ENV_VARS"
