import type { Engine } from './engine.ts';
import { indexTerms, tokenize } from './normalize.ts';
import type { Choice, Clarification, Entry } from './schema.ts';

export interface EntryRef {
  id: string;
  title: string;
}

export type Reply =
  | { type: 'start' }
  | { type: 'answer'; entry: Entry; followUps: EntryRef[]; clarification?: Clarification }
  | { type: 'clarify'; entry: Entry; field: string; question: string; choices: Choice[] }
  | { type: 'disambiguate'; candidates: EntryRef[]; reason: 'ambiguous' | 'negation' | 'number-mismatch' }
  | { type: 'fallback'; reason: 'no-match' | 'low-confidence' | 'clarification-failed' };

export type Input =
  | { type: 'text'; text: string }
  /** A clarification button was pressed. */
  | { type: 'choice'; entryId: string; value: string }
  /** A disambiguation or follow-up button was pressed. */
  | { type: 'pick'; entryId: string }
  | { type: 'back' }
  /** "Other topic": forget context. */
  | { type: 'reset' };

interface Snapshot {
  topicId?: string;
  fields: Record<string, string>;
  pending?: { entryId: string; attempts: number };
  last: Reply;
}

/** Plain JSON: safe to keep in sessionStorage. */
export interface ConversationState extends Snapshot {
  history: Snapshot[];
}

export const initialState = (): ConversationState => ({ fields: {}, last: { type: 'start' }, history: [] });

const MAX_FAILED_CLARIFICATIONS = 2;
const MAX_HISTORY = 10;
const CONTEXT_CHOICE_MAX_TERMS = 4;

export function respond(engine: Engine, state: ConversationState, input: Input): { reply: Reply; state: ConversationState } {
  if (input.type === 'back') {
    const prev = state.history[state.history.length - 1];
    if (!prev) return { reply: { type: 'start' }, state: initialState() };
    return { reply: prev.last, state: { ...prev, history: state.history.slice(0, -1) } };
  }
  if (input.type === 'reset') return commit(state, { fields: {}, last: { type: 'start' } });

  let next: Snapshot;
  if (input.type === 'choice') {
    const entry = engine.get(input.entryId);
    const choice = entry?.clarification?.choices.find((c) => c.value === input.value);
    next = entry && choice ? applyChoice(engine, state, entry, choice) : fallback(state, 'no-match');
  } else if (input.type === 'pick') {
    const entry = engine.get(input.entryId);
    next = entry ? resolveEntry(engine, state, entry) : fallback(state, 'no-match');
  } else {
    next = handleText(engine, state, input.text);
  }
  return commit(state, next);
}

function commit(prev: ConversationState, next: Snapshot): { reply: Reply; state: ConversationState } {
  const { history: _h, ...before } = prev;
  const history = [...prev.history, before].slice(-MAX_HISTORY);
  return { reply: next.last, state: { ...next, history } };
}

function fallback(state: Snapshot, reason: 'no-match' | 'low-confidence' | 'clarification-failed'): Snapshot {
  return { topicId: state.topicId, fields: state.fields, last: { type: 'fallback', reason } };
}

function handleText(engine: Engine, state: ConversationState, text: string): Snapshot {
  const hasNegation = tokenize(text).some((t) => engine.lang.negations.has(t));

  if (state.pending) {
    const topic = engine.get(state.pending.entryId);
    const choice = topic?.clarification && !hasNegation ? matchChoice(engine, topic.clarification, text) : undefined;
    if (topic && choice) return applyChoice(engine, state, topic, choice);

    const fresh = decide(engine, state, text);
    if (fresh.last.type !== 'fallback') return fresh;

    const attempts = state.pending.attempts + 1;
    if (attempts >= MAX_FAILED_CLARIFICATIONS || !topic?.clarification) {
      return { topicId: state.topicId, fields: state.fields, last: { type: 'fallback', reason: 'clarification-failed' } };
    }
    return { ...clarify(topic, topic.clarification, state, attempts) };
  }

  // Short follow-ups like "and for WordPress?" resolve inside the current topic.
  const topic = state.topicId ? engine.get(state.topicId) : undefined;
  if (topic?.clarification && !hasNegation) {
    const content = tokenize(text).filter((t) => !engine.lang.stopwords.has(t));
    if (content.length <= CONTEXT_CHOICE_MAX_TERMS) {
      const choice = matchChoice(engine, topic.clarification, text);
      if (choice) return applyChoice(engine, state, topic, choice);
    }
  }
  return decide(engine, state, text);
}

function decide(engine: Engine, state: Snapshot, text: string): Snapshot {
  const r = engine.retrieve(text);
  if (r.exact) return resolveEntry(engine, state, r.exact);

  const [top] = r.candidates;
  const t = engine.thresholds;
  if (!top) return fallback(state, 'no-match');
  if (top.coverage < t.minCoverage || top.score < t.minScore) return fallback(state, 'low-confidence');

  const close = r.candidates.filter((c) => c.coverage >= t.minCoverage && c.score >= top.score * (1 - t.gap)).slice(0, t.maxCandidates);

  // Siblings of one clarification topic count as a single candidate: ask the clarifying question.
  const groups = new Map<string, Entry>();
  for (const c of close) {
    const g = engine.parentOf(c.entry.id) ?? c.entry;
    if (!groups.has(g.id)) groups.set(g.id, g);
  }
  if (groups.size > 1) {
    return { topicId: state.topicId, fields: state.fields, last: { type: 'disambiguate', reason: 'ambiguous', candidates: [...groups.values()].map(ref) } };
  }

  const target = close.length > 1 ? ([...groups.values()][0] as Entry) : top.entry;
  if (r.hasNegation) {
    return { topicId: state.topicId, fields: state.fields, last: { type: 'disambiguate', reason: 'negation', candidates: [ref(target)] } };
  }
  if (!top.numbersOk) {
    return { topicId: state.topicId, fields: state.fields, last: { type: 'disambiguate', reason: 'number-mismatch', candidates: [ref(target)] } };
  }
  return resolveEntry(engine, state, target);
}

function resolveEntry(engine: Engine, state: Snapshot, entry: Entry): Snapshot {
  const parent = engine.parentOf(entry.id);
  const owner = entry.clarification ? entry : parent;
  let fields = state.fields;

  if (parent?.clarification) {
    const choice = parent.clarification.choices.find((c) => c.answerId === entry.id);
    if (choice) fields = { ...fields, [parent.clarification.field]: choice.value };
  }

  if (entry.clarification) {
    const known = fields[entry.clarification.field];
    const choice = known ? entry.clarification.choices.find((c) => c.value === known) : undefined;
    if (choice && !entry.answer) return applyChoice(engine, { ...state, fields }, entry, choice);
    if (!entry.answer) return clarify(entry, entry.clarification, { ...state, fields }, 0);
  }

  const followUps = entry.followUps.flatMap((id) => {
    const f = engine.get(id);
    return f ? [ref(f)] : [];
  });
  const clarification = entry.clarification && !fields[entry.clarification.field] ? entry.clarification : undefined;
  return { topicId: owner?.id, fields, last: { type: 'answer', entry, followUps, clarification } };
}

function applyChoice(engine: Engine, state: Snapshot, topic: Entry, choice: Choice): Snapshot {
  const target = engine.get(choice.answerId);
  const field = (topic.clarification as Clarification).field;
  const fields = { ...state.fields, [field]: choice.value };
  if (!target) return { topicId: topic.id, fields, last: { type: 'fallback', reason: 'no-match' } };
  const resolved = resolveEntry(engine, { ...state, fields, pending: undefined }, target);
  return { ...resolved, topicId: topic.id, pending: resolved.pending };
}

function clarify(entry: Entry, c: Clarification, state: Snapshot, attempts: number): Snapshot {
  return {
    topicId: entry.id,
    fields: state.fields,
    pending: { entryId: entry.id, attempts },
    last: { type: 'clarify', entry, field: c.field, question: c.question, choices: c.choices },
  };
}

/** Finds exactly one choice named in the text (by label, value or alias). Ambiguity returns undefined. */
export function matchChoice(engine: Engine, c: Clarification, text: string): Choice | undefined {
  const query = indexTerms(text, engine.lang);
  const hits = c.choices.filter((choice) =>
    [choice.label, choice.value, ...choice.aliases].some((phrase) => containsPhrase(query, indexTerms(phrase, engine.lang))),
  );
  return hits.length === 1 ? hits[0] : undefined;
}

function containsPhrase(haystack: string[], needle: string[]): boolean {
  if (needle.length === 0) return false;
  for (let i = 0; i + needle.length <= haystack.length; i++) {
    if (needle.every((n, j) => haystack[i + j] === n)) return true;
  }
  return false;
}

const ref = (e: Entry): EntryRef => ({ id: e.id, title: e.title });
