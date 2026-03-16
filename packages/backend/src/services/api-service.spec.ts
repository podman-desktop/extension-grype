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

import { beforeEach, describe, expect, test, vi } from 'vitest';
import { ApiService } from '/@/services/api-service';
import type { GrypeService } from '/@/services/grype-service';
import type { SyftService } from '/@/services/syft-service';
import type { ImageInfo } from '@podman-desktop/api';
import { readFile } from 'node:fs/promises';
import type { syft } from '@podman-desktop/grype-extension-api';

vi.mock(import('node:fs/promises'));

const GRYPE_SERVICE_MOCK: GrypeService = {
  analyse: vi.fn(),
} as unknown as GrypeService;

const SYFT_SERVICE_MOCK: SyftService = {
  analyse: vi.fn(),
} as unknown as SyftService;

describe('ApiService', () => {
  let apiService: ApiService;

  beforeEach(() => {
    vi.resetAllMocks();
    apiService = new ApiService(GRYPE_SERVICE_MOCK, SYFT_SERVICE_MOCK);
  });

  describe('init', () => {
    test('should return an object with sbom and vulnerability properties', async () => {
      const api = await apiService.init();

      expect(api).toBeDefined();
      expect(api.sbom).toBeDefined();
      expect(api.vulnerability).toBeDefined();
    });
  });

  describe('sbom.analyse', () => {
    const IMAGE_INFO_MOCK: ImageInfo = { Id: 'dummy-image' } as ImageInfo;
    const SBOM_PATH_MOCK = 'dummy-sbom.json';

    beforeEach(() => {
      vi.mocked(SYFT_SERVICE_MOCK.analyse).mockResolvedValue(SBOM_PATH_MOCK);
    });

    test('should call syftService.analyse and parse the result as JSON', async () => {
      const dummySbom: syft.Document = {
        artifacts: [],
        artifactRelationships: [],
        source: {
          id: '',
          name: '',
          version: '',
          type: '',
          metadata: {},
        },
        distro: {},
        descriptor: {
          name: '',
          version: '',
        },
        schema: {
          version: '',
          url: '',
        },
      };

      vi.mocked(readFile).mockResolvedValue(JSON.stringify(dummySbom));

      const api = await apiService.init();
      const result = await api.sbom.analyse(IMAGE_INFO_MOCK);

      expect(SYFT_SERVICE_MOCK.analyse).toHaveBeenCalledWith(IMAGE_INFO_MOCK, undefined);
      expect(readFile).toHaveBeenCalledWith(SBOM_PATH_MOCK, 'utf-8');
      expect(result).toEqual(dummySbom);
    });

    test('parsing error should be reflected in throwed error', async () => {
      const invalidSyftSBOM: syft.Document = { foo: 'bar' } as unknown as syft.Document;
      vi.mocked(readFile).mockResolvedValue(JSON.stringify(invalidSyftSBOM));

      const api = await apiService.init();

      await expect(async () => {
        return api.sbom.analyse(IMAGE_INFO_MOCK);
      }).rejects.toThrowError('cannot parse syft SBOM document:');
    });
  });

  describe('vulnerability.analyse', () => {
    test('should call syftService.analyse and then grypeService.analyse', async () => {
      const image: ImageInfo = { Id: 'dummy-image' } as ImageInfo;
      const dummyPath = 'dummy-sbom.json';
      const dummyVulnerabilities = { matches: [] };

      vi.mocked(SYFT_SERVICE_MOCK.analyse).mockResolvedValue(dummyPath);
      vi.mocked(GRYPE_SERVICE_MOCK.analyse).mockResolvedValue(dummyVulnerabilities);

      const api = await apiService.init();
      const result = await api.vulnerability.analyse(image);

      expect(SYFT_SERVICE_MOCK.analyse).toHaveBeenCalledWith(image, undefined);
      expect(GRYPE_SERVICE_MOCK.analyse).toHaveBeenCalledWith(dummyPath, undefined);
      expect(result).toEqual(dummyVulnerabilities);
    });
  });
});
