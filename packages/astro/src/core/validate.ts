import { getLanguage } from './languages/index.ts';
import { canonicalPhrase } from './normalize.ts';
import { type Entry, type EntryInput, entrySchema } from './schema.ts';

export interface Issue {
  severity: 'error' | 'warning';
  entryId?: string;
  code: string;
  message: string;
}

export interface ValidationResult {
  entries: Entry[];
  issues: Issue[];
  ok: boolean;
}

const langOf = (e: Entry) => e.language.toLowerCase().split('-')[0] as string;
const key = (e: Entry, id = e.id) => `${langOf(e)}/${id}`;

const isUrlLike = (u: string) => u.startsWith('/') || /^https?:\/\//i.test(u);

/** Parses raw entries with the schema and checks cross-entry integrity. Never throws. */
export function validateKnowledge(raw: readonly unknown[]): ValidationResult {
  const issues: Issue[] = [];
  const entries: Entry[] = [];

  raw.forEach((item, i) => {
    const parsed = entrySchema.safeParse(item as EntryInput);
    if (parsed.success) {
      entries.push(parsed.data);
      return;
    }
    const id = (item as { id?: unknown } | null)?.id;
    for (const err of parsed.error.issues) {
      issues.push({
        severity: 'error',
        entryId: typeof id === 'string' ? id : undefined,
        code: 'schema',
        message: `entry #${i}: ${err.path.join('.') || '(root)'}: ${err.message}`,
      });
    }
  });

  const byId = new Map<string, Entry>();
  for (const e of entries) {
    if (byId.has(key(e))) {
      issues.push({ severity: 'error', entryId: e.id, code: 'duplicate-id', message: `duplicate id "${e.id}" in language "${langOf(e)}"` });
    } else {
      byId.set(key(e), e);
    }
  }

  const questionOwner = new Map<string, string>();
  for (const e of entries) {
    const lang = getLanguage(e.language);

    if (e.questions.length === 0) {
      issues.push({ severity: 'warning', entryId: e.id, code: 'no-questions', message: 'no example questions; matching relies on title and keywords only' });
    }
    if (e.answer && e.sources.length === 0) {
      issues.push({ severity: 'warning', entryId: e.id, code: 'no-sources', message: 'answer has no sources' });
    }
    for (const s of e.sources) {
      if (!isUrlLike(s.url)) {
        issues.push({ severity: 'error', entryId: e.id, code: 'bad-source-url', message: `source url "${s.url}" must start with "/" or http(s)://` });
      }
    }

    for (const q of [e.title, ...e.questions]) {
      const qKey = `${langOf(e)}|${canonicalPhrase(q, lang)}`;
      const owner = questionOwner.get(qKey);
      if (owner && owner !== e.id) {
        issues.push({ severity: 'warning', entryId: e.id, code: 'duplicate-question', message: `"${q}" is also used by "${owner}"; exact matches will be ambiguous` });
      } else {
        questionOwner.set(qKey, e.id);
      }
    }

    for (const f of e.followUps) {
      if (!byId.has(key(e, f))) {
        issues.push({ severity: 'error', entryId: e.id, code: 'missing-follow-up', message: `followUps references unknown id "${f}"` });
      }
    }

    if (e.clarification) {
      const values = new Set<string>();
      for (const c of e.clarification.choices) {
        if (values.has(c.value)) {
          issues.push({ severity: 'error', entryId: e.id, code: 'duplicate-choice', message: `duplicate choice value "${c.value}"` });
        }
        values.add(c.value);
        const target = byId.get(key(e, c.answerId));
        if (!target) {
          issues.push({ severity: 'error', entryId: e.id, code: 'missing-answer', message: `choice "${c.value}" points to unknown id "${c.answerId}" (ids are resolved within the entry's language)` });
        } else if (target.id === e.id) {
          issues.push({ severity: 'error', entryId: e.id, code: 'self-reference', message: `choice "${c.value}" points back to its own entry` });
        }
      }
    }
  }

  // Clarification cycles (A -> B -> A) would make the conversation loop forever.
  for (const e of entries) {
    const seen = new Set<string>([e.id]);
    const stack = [e];
    while (stack.length) {
      const cur = stack.pop() as Entry;
      for (const c of cur.clarification?.choices ?? []) {
        const next = byId.get(key(cur, c.answerId));
        if (!next) continue;
        if (next.id === e.id && cur.id !== e.id) {
          issues.push({ severity: 'error', entryId: e.id, code: 'cycle', message: `clarification cycle through "${cur.id}"` });
        } else if (!seen.has(next.id)) {
          seen.add(next.id);
          stack.push(next);
        }
      }
    }
  }

  return { entries, issues, ok: !issues.some((i) => i.severity === 'error') };
}
