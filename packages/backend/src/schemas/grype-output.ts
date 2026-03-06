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

/**
 * No json-schema is provided for grype json output
 * Waiting on upstream https://github.com/anchore/grype/issues/214
 */
export const GrypeOutputSchema = z.object({
  matches: z.array(
    z.object({
      vulnerability: z.object({
        id: z.string(),
        severity: z
          .string()
          .optional()
          .transform(severity => {
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
          }),
        description: z.string().optional(),
      }),
    }),
  ),
});

export type GrypeOutput = z.output<typeof GrypeOutputSchema>;
