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
import type { CancellationToken, ImageInfo, TelemetryLogger } from '@podman-desktop/api';
import { window, ProgressLocation } from '@podman-desktop/api';
import { readFile } from 'node:fs/promises';
import type { syft } from '@podman-desktop/grype-extension-api';
import { TELEMETRY_EVENTS } from '/@/utils/telemetry';
import type { AnchoreCliService } from '/@/services/anchore-cli-service';

vi.mock(import('node:fs/promises'));
vi.mock(import('@podman-desktop/api'));

class TestApiService extends ApiService {
  public override async assertInstalled(): Promise<void> {
    return super.assertInstalled();
  }
}

const GRYPE_SERVICE_MOCK: GrypeService = {
  analyse: vi.fn(),
  isInstalled: vi.fn(),
  install: vi.fn(),
} as unknown as GrypeService;

const SYFT_SERVICE_MOCK: SyftService = {
  analyse: vi.fn(),
  isInstalled: vi.fn(),
  install: vi.fn(),
} as unknown as SyftService;

const TELEMETRY_LOGGER_MOCK: TelemetryLogger = {
  logUsage: vi.fn(),
  logError: vi.fn(),
  dispose: vi.fn(),
} as unknown as TelemetryLogger;

describe('ApiService', () => {
  let apiService: TestApiService;

  beforeEach(() => {
    vi.resetAllMocks();
    apiService = new TestApiService(GRYPE_SERVICE_MOCK, SYFT_SERVICE_MOCK, TELEMETRY_LOGGER_MOCK);

    vi.mocked(SYFT_SERVICE_MOCK.isInstalled).mockReturnValue(true);
    vi.mocked(GRYPE_SERVICE_MOCK.isInstalled).mockReturnValue(true);

    vi.mocked(window.withProgress).mockImplementation((_, fn) => {
      return fn({ report: vi.fn() }, {} as CancellationToken);
    });
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

      expect(TELEMETRY_LOGGER_MOCK.logUsage).toHaveBeenCalledExactlyOnceWith(TELEMETRY_EVENTS.SYFT_ANALYSE, {
        duration: expect.any(Number),
      });
    });

    test('parsing error should be reflected in throwed error', async () => {
      const invalidSyftSBOM: syft.Document = { foo: 'bar' } as unknown as syft.Document;
      vi.mocked(readFile).mockResolvedValue(JSON.stringify(invalidSyftSBOM));

      const api = await apiService.init();

      await expect(async () => {
        return api.sbom.analyse(IMAGE_INFO_MOCK);
      }).rejects.toThrow('cannot parse syft SBOM document:');

      expect(TELEMETRY_LOGGER_MOCK.logUsage).toHaveBeenCalledExactlyOnceWith(
        TELEMETRY_EVENTS.SYFT_ANALYSE,
        expect.objectContaining({
          error: expect.any(Error),
        }),
      );
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

      expect(TELEMETRY_LOGGER_MOCK.logUsage).toHaveBeenCalledExactlyOnceWith(TELEMETRY_EVENTS.GRYPE_ANALYSE, {
        duration: expect.any(Number),
      });
    });
  });

  describe('assertInstalled', () => {
    test.each<{
      name: string;
      service: AnchoreCliService;
    }>([
      {
        name: 'syft',
        service: SYFT_SERVICE_MOCK,
      },
      {
        name: 'grype',
        service: GRYPE_SERVICE_MOCK,
      },
    ])('$name not installed should prompt user', async ({ service }) => {
      vi.mocked(service.isInstalled).mockReturnValue(false);

      await expect(async () => {
        await apiService.assertInstalled();
      }).rejects.toThrow('user cancelled the installation');

      expect(window.showInformationMessage).toHaveBeenCalledExactlyOnceWith(
        'Grype extension requires to install Syft and Grype binaries to scan images, do you want to install them?',
        'Yes',
        'Cancel',
      );
    });

    test('withProgress should be called with the correct parameters', async () => {
      vi.mocked(SYFT_SERVICE_MOCK.isInstalled).mockReturnValue(false);
      vi.mocked(GRYPE_SERVICE_MOCK.isInstalled).mockReturnValue(false);
      vi.mocked(window.showInformationMessage).mockResolvedValue('Yes');

      await apiService.assertInstalled();

      expect(window.withProgress).toHaveBeenCalledWith(
        expect.objectContaining({
          location: ProgressLocation.TASK_WIDGET,
          title: 'Installing Grype binaries',
        }),
        expect.any(Function),
      );
    });

    test('should call install on GrypeService and SyftService', async () => {
      vi.mocked(SYFT_SERVICE_MOCK.isInstalled).mockReturnValue(false);
      vi.mocked(GRYPE_SERVICE_MOCK.isInstalled).mockReturnValue(false);
      vi.mocked(window.showInformationMessage).mockResolvedValue('Yes');

      await apiService.assertInstalled();

      expect(SYFT_SERVICE_MOCK.install).toHaveBeenCalledOnce();
      expect(GRYPE_SERVICE_MOCK.install).toHaveBeenCalledOnce();
    });
  });
});
