import { z } from 'zod';

const id = z
  .string()
  .min(1)
  .regex(/^[a-z0-9][a-z0-9._-]*$/i, 'ids may contain letters, digits, ".", "_" and "-" only');

export const sourceSchema = z.object({
  title: z.string().min(1),
  /** Site-relative path ("/docs/install/") or absolute http(s) URL. */
  url: z.string().min(1),
});

export const choiceSchema = z.object({
  label: z.string().min(1),
  /** Machine value stored in conversation state, e.g. "astro". */
  value: z.string().min(1),
  /** Entry that answers (or further clarifies) when this choice is picked. */
  answerId: id,
  /** Extra words that should select this choice when typed, e.g. "wp". */
  aliases: z.array(z.string().min(1)).default([]),
});

export const clarificationSchema = z.object({
  field: z.string().min(1),
  question: z.string().min(1),
  choices: z.array(choiceSchema).min(2),
});

export const entrySchema = z
  .object({
    id,
    language: z.string().min(2),
    title: z.string().min(1),
    /** Example questions; the strongest signal for matching. */
    questions: z.array(z.string().min(1)).default([]),
    keywords: z.array(z.string().min(1)).default([]),
    /** Final answer text (plain text). Absent on pure clarification topics. */
    answer: z.string().min(1).optional(),
    sources: z.array(sourceSchema).default([]),
    clarification: clarificationSchema.optional(),
    /** Offer this entry as a starter suggestion when the chat opens. If no entry sets it, the first few are used. */
    suggested: z.boolean().default(false),
    /** Ids of entries offered as next questions after this answer. */
    followUps: z.array(id).default([]),
  })
  .refine((e) => e.answer !== undefined || e.clarification !== undefined, {
    message: 'an entry needs an "answer", a "clarification", or both',
  });

export type Source = z.infer<typeof sourceSchema>;
export type Choice = z.infer<typeof choiceSchema>;
export type Clarification = z.infer<typeof clarificationSchema>;
export type Entry = z.infer<typeof entrySchema>;
export type EntryInput = z.input<typeof entrySchema>;
