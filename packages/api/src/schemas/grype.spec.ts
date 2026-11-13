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
import { GrypeDocumentSchema } from './grype';

import { test, expect } from 'vitest';
import * as helloWorld from '../fixtures/grype/hello-world.json' with { type: 'json' };
import * as alpine from '../fixtures/grype/alpine-3.14.0.json' with { type: 'json' };
import * as nullLists from '../fixtures/grype/null-lists.json' with { type: 'json' };

interface TestCase {
  name: string;
  input: unknown;
  success: boolean;
}

test.each<TestCase>([
  {
    name: 'empty object should be failing',
    success: false,
    input: {},
  },
  {
    name: 'quay.io/podman/hello result',
    success: true,
    input: helloWorld,
  },
  {
    name: 'docker.io/library/alpine:3.14.0 result',
    success: true,
    input: alpine,
  },
  {
    name: 'match without artifact should be failing',
    success: false,
    input: {
      matches: [{ vulnerability: alpine.matches[0].vulnerability }],
    },
  },
])('$name', ({ input, success }) => {
  const result = GrypeDocumentSchema.safeParse(input);
  expect(result.success).toEqual(success);
});

test('matches should expose vulnerability, fix and affected package', () => {
  const document = GrypeDocumentSchema.parse(alpine);

  expect(document.matches).toHaveLength(3);
  expect(document.descriptor).toEqual({
    name: 'grype',
    version: '0.121.3',
    timestamp: expect.any(String),
  });
  expect(document.distro).toEqual({
    name: 'alpine',
    version: '3.14.0',
    idLike: [],
  });

  const [match] = document.matches;
  expect(match.vulnerability).toEqual(
    expect.objectContaining({
      id: 'CVE-2021-3711',
      severity: 'critical',
      fix: {
        versions: ['1.1.1l-r0'],
        state: 'fixed',
        available: [{ version: '1.1.1l-r0', date: '2026-02-27', kind: 'first-observed' }],
      },
    }),
  );
  expect(match.vulnerability.cvss[0].metrics.baseScore).toBeCloseTo(9.8);
  expect(match.vulnerability.epss[0].cve).toBe('CVE-2021-3711');
  expect(match.relatedVulnerabilities[0].dataSource).toBe('https://nvd.nist.gov/vuln/detail/CVE-2021-3711');
  expect(match.matchDetails[0].fix).toEqual({ suggestedVersion: '1.1.1l-r0' });
  expect(match.artifact).toEqual(
    expect.objectContaining({
      name: 'libcrypto1.1',
      version: '1.1.1k-r0',
      type: 'apk',
      purl: 'pkg:apk/alpine/libcrypto1.1@1.1.1k-r0?arch=aarch64&distro=alpine-3.14.0&upstream=openssl',
      upstreams: [{ name: 'openssl' }],
    }),
  );
});

test('null and missing lists should be normalised to empty arrays', () => {
  const document = GrypeDocumentSchema.parse(nullLists);

  const [match] = document.matches;
  expect(match.vulnerability).toEqual({
    id: 'CVE-2021-3711',
    dataSource: 'https://security.alpinelinux.org/vuln/CVE-2021-3711',
    severity: 'low',
    urls: [],
    cvss: [],
    knownExploited: [],
    epss: [],
    cwes: [],
    fix: {
      versions: [],
      state: 'unknown',
      available: [],
    },
    advisories: [],
  });
  expect(match.relatedVulnerabilities).toEqual([]);
  expect(match.matchDetails).toEqual([]);
  expect(match.artifact).toEqual({
    id: '3fd9cbaa3d8259d2',
    name: 'libcrypto1.1',
    version: '1.1.1k-r0',
    type: 'apk',
    locations: [],
    licenses: [],
    cpes: [],
    upstreams: [],
  });
  expect(document.distro?.idLike).toEqual([]);
});
