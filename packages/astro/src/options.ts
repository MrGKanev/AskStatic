import { z } from 'zod';

export const optionsSchema = z
  .object({
    /** Folder (relative to the project root) with YAML/JSON knowledge files. */
    knowledge: z.string().default('src/askstatic'),
    /** Languages to build. Defaults to every language found in the knowledge files. */
    languages: z.array(z.string().min(2)).optional(),
    defaultLanguage: z.string().min(2).default('en'),
    /** Build a Pagefind index of the site for the fallback search. Skipped with a warning if `pagefind` is not installed. */
    pagefind: z
      .union([
        z.boolean(),
        z.object({ rootSelector: z.string().optional(), excludeSelectors: z.array(z.string()).optional() }),
      ])
      .default(true),
    /** Output folder inside the build output. */
    outputDir: z.string().regex(/^[\w-]+$/).default('_askstatic'),
    thresholds: z
      .object({
        minCoverage: z.number().min(0).max(1),
        minScore: z.number().min(0),
        gap: z.number().min(0).max(1),
        maxCandidates: z.number().int().min(1).max(6),
      })
      .partial()
      .default({}),
    /** Fail the build on warnings (missing sources, duplicate questions, broken source links). */
    strict: z.boolean().default(false),
  })
  .strict();

export type AskStaticOptions = z.input<typeof optionsSchema>;
export type ResolvedOptions = z.output<typeof optionsSchema>;
