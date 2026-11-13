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
import { z } from 'zod';

function normalizeSeverity(severity?: string): 'high' | 'critical' | 'medium' | 'low' | undefined {
  switch (severity?.toLowerCase()) {
    case 'high':
      return 'high';
    case 'critical':
      return 'critical';
    case 'medium':
      return 'medium';
    case 'low':
    case 'negligible':
      return 'low';
    default:
      return undefined;
  }
}

/**
 * Go serialises nil slices as `null`, normalise them to empty arrays
 */
function list<T extends z.ZodType>(item: T): z.ZodType<Array<z.output<T>>, Array<z.input<T>> | null | undefined> {
  return z
    .array(item)
    .nullish()
    .transform(value => value ?? []);
}

const CvssSchema = z.object({
  source: z.string().optional(),
  type: z.string().optional(),
  version: z.string(),
  vector: z.string(),
  metrics: z.object({
    baseScore: z.number(),
    exploitabilityScore: z.number().optional(),
    impactScore: z.number().optional(),
  }),
});

const KnownExploitedSchema = z.object({
  cve: z.string(),
  vendorProject: z.string().optional(),
  product: z.string().optional(),
  dateAdded: z.string().optional(),
  requiredAction: z.string().optional(),
  dueDate: z.string().optional(),
  knownRansomwareCampaignUse: z.string().optional(),
  notes: z.string().optional(),
  urls: list(z.string()),
  cwes: list(z.string()),
});

const EPSSSchema = z.object({
  cve: z.string(),
  epss: z.number(),
  percentile: z.number(),
  date: z.string(),
});

const CWESchema = z.object({
  cve: z.string(),
  cwe: z.string().optional(),
  source: z.string().optional(),
  type: z.string().optional(),
});

const VulnerabilityMetadataSchema = z.object({
  id: z.string(),
  dataSource: z.string(),
  namespace: z.string().optional(),
  severity: z.string().optional().transform(normalizeSeverity),
  urls: list(z.string()),
  description: z.string().optional(),
  cvss: list(CvssSchema),
  knownExploited: list(KnownExploitedSchema),
  epss: list(EPSSSchema),
  cwes: list(CWESchema),
});

const FixSchema = z.object({
  versions: list(z.string()),
  // e.g. `fixed`, `not-fixed`, `wont-fix`, `unknown` or empty
  state: z.string(),
  available: list(
    z.object({
      version: z.string(),
      date: z.string(),
      kind: z.string().optional(),
    }),
  ),
});

const AdvisorySchema = z.object({
  id: z.string(),
  link: z.string(),
});

const VulnerabilitySchema = VulnerabilityMetadataSchema.extend({
  fix: FixSchema,
  advisories: list(AdvisorySchema),
  risk: z.number().optional(),
});

const PackageSchema = z.object({
  id: z.string(),
  name: z.string(),
  version: z.string(),
  type: z.string(),
  locations: list(
    z.object({
      path: z.string(),
      layerID: z.string().optional(),
      accessPath: z.string().optional(),
    }),
  ),
  language: z.string().optional(),
  licenses: list(z.string()),
  cpes: list(z.string()),
  purl: z.string().optional(),
  upstreams: list(
    z.object({
      name: z.string(),
      version: z.string().optional(),
    }),
  ),
});

const MatchDetailsSchema = z.object({
  type: z.string(),
  matcher: z.string(),
  searchedBy: z.unknown(),
  found: z.unknown(),
  fix: z
    .object({
      suggestedVersion: z.string(),
    })
    .optional(),
});

const MatchSchema = z.object({
  vulnerability: VulnerabilitySchema,
  relatedVulnerabilities: list(VulnerabilityMetadataSchema),
  matchDetails: list(MatchDetailsSchema),
  artifact: PackageSchema,
});

const DistributionSchema = z.object({
  name: z.string(),
  version: z.string(),
  idLike: list(z.string()),
});

const DescriptorSchema = z.object({
  name: z.string(),
  version: z.string(),
  timestamp: z.string().optional(),
});

/**
 * No json-schema is provided for grype json output
 * Waiting on upstream https://github.com/anchore/grype/issues/214
 *
 * The schemas are based on the grype presenter models
 * https://github.com/anchore/grype/tree/main/grype/presenter/models
 *
 * The grype binary may be a system-wide installation of an older version,
 * therefore fields which are not always emitted are optional.
 */
export const GrypeDocumentSchema = z.object({
  matches: z.array(MatchSchema),
  distro: DistributionSchema.optional(),
  descriptor: DescriptorSchema.optional(),
});

export type Cvss = z.output<typeof CvssSchema>;
export type KnownExploited = z.output<typeof KnownExploitedSchema>;
export type EPSS = z.output<typeof EPSSSchema>;
export type CWE = z.output<typeof CWESchema>;
export type VulnerabilityMetadata = z.output<typeof VulnerabilityMetadataSchema>;
export type Fix = z.output<typeof FixSchema>;
export type Advisory = z.output<typeof AdvisorySchema>;
export type Vulnerability = z.output<typeof VulnerabilitySchema>;
export type Package = z.output<typeof PackageSchema>;
export type MatchDetails = z.output<typeof MatchDetailsSchema>;
export type Match = z.output<typeof MatchSchema>;
export type Distribution = z.output<typeof DistributionSchema>;
export type Descriptor = z.output<typeof DescriptorSchema>;
export type Document = z.output<typeof GrypeDocumentSchema>;
