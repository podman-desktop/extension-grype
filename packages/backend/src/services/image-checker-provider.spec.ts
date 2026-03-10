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

import { test, vi, beforeEach, expect, describe, assert } from 'vitest';
import { ImageCheckerProvider } from './image-checker-provider';
import type { SyftService } from './syft-service';
import type { GrypeService } from './grype-service';
import type { ProviderResult, ImageInfo, Disposable, CancellationToken, ImageChecks } from '@podman-desktop/api';
import { imageChecker } from '@podman-desktop/api';

vi.mock(import('./syft-service'));
vi.mock(import('./grype-service'));

const SYFT_SERVICE_MOCK: SyftService = {
  analyse: vi.fn(),
} as unknown as SyftService;
const GRYPE_SERVICE_MOCK: GrypeService = {
  analyse: vi.fn(),
} as unknown as GrypeService;
const IMAGE_INFO_MOCK = {
  Id: 'image-id',
  engineId: 'engine-id',
} as ImageInfo;

let provider: ImageCheckerProvider;
beforeEach(() => {
  vi.resetAllMocks();

  provider = new ImageCheckerProvider(SYFT_SERVICE_MOCK, GRYPE_SERVICE_MOCK);
});

test('init should register image checker provider', async () => {
  const disposableMock = { dispose: vi.fn() } as Disposable;
  vi.mocked(imageChecker.registerImageCheckerProvider).mockReturnValue(disposableMock);

  await provider.init();

  expect(imageChecker.registerImageCheckerProvider).toHaveBeenCalledExactlyOnceWith({
    check: expect.any(Function),
  });
});

test('dispose should dispose of registered providers', async () => {
  const disposable: Disposable = { dispose: vi.fn() };
  vi.mocked(imageChecker.registerImageCheckerProvider).mockReturnValue(disposable);

  await provider.init();
  provider.dispose();

  expect(disposable.dispose).toHaveBeenCalledExactlyOnceWith();
});

describe('check', () => {
  let check: (image: ImageInfo, _token?: CancellationToken) => ProviderResult<ImageChecks>;

  beforeEach(async () => {
    await provider.init();

    const fn = vi.mocked(imageChecker.registerImageCheckerProvider).mock.calls[0][0];
    assert(fn?.check);
    check = fn.check;
  });

  test('should return "No vulnerabilities found" when no matches are found', async () => {
    vi.mocked(SYFT_SERVICE_MOCK.analyse).mockResolvedValue('sbom-path');
    vi.mocked(GRYPE_SERVICE_MOCK.analyse).mockResolvedValue({ matches: [] });

    const token: CancellationToken = {} as unknown as CancellationToken;

    const result = await check(IMAGE_INFO_MOCK, token);

    expect(SYFT_SERVICE_MOCK.analyse).toHaveBeenCalledWith(IMAGE_INFO_MOCK, {
      token,
    });
    expect(GRYPE_SERVICE_MOCK.analyse).toHaveBeenCalledWith('sbom-path', {
      token,
    });
    expect(result).toEqual({
      checks: [
        {
          status: 'success',
          name: 'No vulnerabilities found',
        },
      ],
    });
  });

  test('should return list of vulnerabilities when matches are found', async () => {
    vi.mocked(SYFT_SERVICE_MOCK.analyse).mockResolvedValue('sbom-path');
    vi.mocked(GRYPE_SERVICE_MOCK.analyse).mockResolvedValue({
      matches: [
        {
          vulnerability: {
            id: 'CVE-2021-1234',
            severity: 'high',
            description: 'Vulnerability description',
          },
        },
      ],
    });

    const result = await check(IMAGE_INFO_MOCK);

    expect(result).toEqual({
      checks: [
        {
          name: 'CVE-2021-1234',
          status: 'failed',
          severity: 'high',
          markdownDescription: 'Vulnerability description',
        },
      ],
    });
  });
});
