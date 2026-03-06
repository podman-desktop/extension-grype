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
import { Octokit } from '@octokit/rest';
import { test, vi, beforeEach, expect, assert } from 'vitest';
import { OctokitDisposable } from '/@/utils/octokit-disposable';

vi.mock(import('@octokit/rest'));

let octokit: OctokitDisposable;

beforeEach(() => {
  vi.resetAllMocks();

  octokit = new OctokitDisposable();
});

test('octokit instance should receive an abort signal as constructor options', async () => {
  expect(Octokit).toHaveBeenCalledExactlyOnceWith({
    request: {
      signal: expect.any(AbortSignal),
    },
  });

  const options = vi.mocked(Octokit).mock.calls[0][0];
  assert(options?.request?.signal);

  expect(options?.request?.signal.aborted).toBeFalsy();
});

test('expect disposed instance to have signal aborted', async () => {
  const options = vi.mocked(Octokit).mock.calls[0][0];
  assert(options?.request?.signal);

  expect(options.request.signal.aborted).toBeFalsy();

  octokit.dispose();

  expect(options.request.signal.aborted).toBeTruthy();
});
