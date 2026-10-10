import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createEngine, initialState, loadEngine, respond, tokenize, validateKnowledge, type Engine, type Reply } from '../src/core/index.ts';

const raw = JSON.parse(readFileSync(new URL('./fixtures/en-kb.json', import.meta.url), 'utf8'));
const kb = validateKnowledge(raw);
const engine = createEngine(kb.entries, 'en');

const say = (e: Engine, text: string, s = initialState()) => respond(e, s, { type: 'text', text });
const type = (r: Reply) => r.type;

describe('tokenize', () => {
  it('keeps versions and numbers intact and lower-cases', () => {
    expect(tokenize('Astro 5.1.2, Node 22!')).toEqual(['astro', '5.1.2', 'node', '22']);
  });
  it('handles Cyrillic', () => {
    expect(tokenize('Как се инсталира?')).toEqual(['как', 'се', 'инсталира']);
  });
});

describe('validateKnowledge', () => {
  it('accepts the fixture without errors', () => {
    expect(kb.issues.filter((i) => i.severity === 'error')).toEqual([]);
  });
  it('reports duplicate ids, dangling choices and bad urls', () => {
    const bad = [
      { id: 'a', language: 'en', title: 'A', answer: 'x', sources: [{ title: 't', url: 'nope' }] },
      { id: 'a', language: 'en', title: 'A2', answer: 'x' },
      { id: 'c', language: 'en', title: 'C', clarification: { field: 'f', question: 'q?', choices: [
        { label: 'one', value: '1', answerId: 'missing' }, { label: 'two', value: '2', answerId: 'a' } ] } },
      { id: 'd', language: 'en', title: 'D' },
    ];
    const codes = validateKnowledge(bad).issues.map((i) => i.code);
    expect(codes).toEqual(expect.arrayContaining(['duplicate-id', 'missing-answer', 'bad-source-url', 'schema']));
  });
  it('detects clarification cycles', () => {
    const cyc = [
      { id: 'a', language: 'en', title: 'A', clarification: { field: 'f', question: 'q?', choices: [
        { label: 'x', value: 'x', answerId: 'b' }, { label: 'y', value: 'y', answerId: 'b' } ] } },
      { id: 'b', language: 'en', title: 'B', clarification: { field: 'g', question: 'q?', choices: [
        { label: 'x', value: 'x', answerId: 'a' }, { label: 'y', value: 'y', answerId: 'a' } ] } },
    ];
    expect(validateKnowledge(cyc).issues.some((i) => i.code === 'cycle')).toBe(true);
  });
});

describe('answers', () => {
  it('answers a clear question with sources and follow-ups', () => {
    const { reply } = say(engine, 'How much does it cost?');
    expect(reply.type).toBe('answer');
    if (reply.type === 'answer') {
      expect(reply.entry.id).toBe('pricing');
      expect(reply.entry.sources[0]?.url).toBe('/pricing/');
      expect(reply.followUps.map((f) => f.id)).toEqual(['refunds']);
    }
  });
  it('falls back for off-topic and gibberish input', () => {
    expect(type(say(engine, 'what is the weather today').reply)).toBe('fallback');
    expect(type(say(engine, 'asdfgh').reply)).toBe('fallback');
    expect(type(say(engine, 'the').reply)).toBe('fallback');
  });
  it('never answers confidently when the query contains a negation', () => {
    expect(type(say(engine, 'does it not collect data').reply)).not.toBe('answer');
  });
  it('does not answer when a version number is not covered', () => {
    const { reply } = say(engine, 'what are the requirements for node 18');
    expect(reply.type).toBe('disambiguate');
    if (reply.type === 'disambiguate') expect(reply.reason).toBe('number-mismatch');
  });
});

describe('clarification flow', () => {
  it('asks the platform question, then answers from the choice', () => {
    const a = say(engine, 'how do I install it');
    expect(a.reply.type).toBe('clarify');
    const b = respond(engine, a.state, { type: 'choice', entryId: 'installation', value: 'wordpress' });
    expect(b.reply.type === 'answer' && b.reply.entry.id).toBe('installation-wordpress');
    expect(b.state.fields.platform).toBe('wordpress');
  });
  it('accepts a free-text answer to the clarification, including aliases', () => {
    const a = say(engine, 'installation');
    const b = say(engine, 'it is a WP site', a.state);
    expect(b.reply.type === 'answer' && b.reply.entry.id).toBe('installation-wordpress');
  });
  it('does not guess when the free-text answer names two choices', () => {
    const a = say(engine, 'installation');
    const b = say(engine, 'astro or wordpress', a.state);
    expect(b.reply.type).toBe('clarify');
  });
  it('gives up after two failed clarifications', () => {
    let s = say(engine, 'installation').state;
    const r1 = say(engine, 'banana', s);
    expect(r1.reply.type).toBe('clarify');
    const r2 = say(engine, 'banana again', r1.state);
    expect(r2.reply).toEqual({ type: 'fallback', reason: 'clarification-failed' });
  });
  it('lets the user change topic while a clarification is pending', () => {
    const a = say(engine, 'installation');
    const b = say(engine, 'how much does it cost', a.state);
    expect(b.reply.type === 'answer' && b.reply.entry.id).toBe('pricing');
    expect(b.state.pending).toBeUndefined();
  });
  it('resolves short follow-ups inside the current topic', () => {
    const a = say(engine, 'how do I install it on astro');
    expect(a.reply.type === 'answer' && a.reply.entry.id).toBe('installation-astro');
    const b = say(engine, 'and for WordPress?', a.state);
    expect(b.reply.type === 'answer' && b.reply.entry.id).toBe('installation-wordpress');
  });
  it('does not re-ask a field it already knows', () => {
    const a = say(engine, 'install on astro');
    const b = say(engine, 'installation', a.state);
    expect(b.reply.type === 'answer' && b.reply.entry.id).toBe('installation-astro');
  });
  it('supports back and reset', () => {
    const a = say(engine, 'how much does it cost');
    const b = say(engine, 'installation', a.state);
    const back = respond(engine, b.state, { type: 'back' });
    expect(back.reply.type === 'answer' && back.reply.entry.id).toBe('pricing');
    expect(respond(engine, b.state, { type: 'reset' }).reply.type).toBe('start');
    expect(respond(engine, initialState(), { type: 'back' }).reply.type).toBe('start');
  });
  it('state survives a JSON round-trip', () => {
    const a = say(engine, 'installation');
    const restored = JSON.parse(JSON.stringify(a.state));
    const b = respond(engine, restored, { type: 'choice', entryId: 'installation', value: 'html' });
    expect(b.reply.type === 'answer' && b.reply.entry.id).toBe('installation-html');
  });
});

describe('serialisation', () => {
  it('a loaded engine behaves like the built one', () => {
    const loaded = loadEngine(JSON.parse(JSON.stringify(engine.toJSON())));
    for (const q of ['how much does it cost', 'installation', 'is it gdpr compliant', 'banana']) {
      expect(type(say(loaded, q).reply)).toBe(type(say(engine, q).reply));
    }
  });
});

describe('multilingual ids', () => {
  it('allows the same id in different languages and resolves choices within the language', () => {
    const mk = (language: string) => [
      { id: 'a', language, title: 'A', clarification: { field: 'f', question: 'q?', choices: [
        { label: 'x', value: 'x', answerId: 'b' }, { label: 'y', value: 'y', answerId: 'b' } ] } },
      { id: 'b', language, title: 'B', answer: 'ok', sources: [{ title: 's', url: '/s/' }] },
    ];
    expect(validateKnowledge([...mk('en'), ...mk('bg')]).issues.filter((i) => i.severity === 'error')).toEqual([]);
    expect(validateKnowledge([...mk('en'), ...mk('en')]).issues.some((i) => i.code === 'duplicate-id')).toBe(true);
  });
});

describe('bulgarian', () => {
  const bgKb = validateKnowledge(JSON.parse(readFileSync(new URL('./fixtures/bg-kb.json', import.meta.url), 'utf8')));
  const bgEngine = createEngine(bgKb.entries, 'bg');
  const answerId = (q: string) => {
    const r = say(bgEngine, q).reply;
    return r.type === 'answer' ? r.entry.id : r.type;
  };
  it('matches definite forms and different word forms', () => {
    expect(answerId('каква е цената')).toBe('pricing');
    expect(answerId('кои езици се поддържат')).toBe('languages');
  });
  it('understands Latin-typed Bulgarian as a second channel', () => {
    expect(answerId('kolko struva')).toBe('pricing');
    expect(answerId('kakva e tsenata')).toBe('pricing');
  });
  it('keeps Bulgarian negation from producing a confident answer', () => {
    expect(type(say(bgEngine, 'не събира ли данни').reply)).not.toBe('answer');
  });
});

describe('vocabulary and question frame', () => {
  const entry = (id: string, title: string, questions: string[], keywords: string[] = [], answer = 'x') =>
    ({ id, language: 'en', title, questions, keywords, answer, sources: [], suggested: false, followUps: [] }) as const;
  const kb = validateKnowledge([
    entry('pricing', 'Pricing', ['How much does it cost?'], ['price']),
    entry('consulting', 'Consulting', ['What consulting do you offer?']),
    entry('learning', 'Learning', ['How do I learn programming?'], ['coding']),
    entry('cf-a', "Cloudflare's trust is the vulnerability", [], ['cloudflare']),
    entry('cf-b', 'MP4, Safari and Cloudflare', [], ['cloudflare']),
  ]);
  if (!kb.ok) throw new Error('fixture invalid');
  const engine = createEngine(kb.entries, 'en');
  const ask = (q: string) => respond(engine, initialState(), { type: 'text', text: q }).reply;

  it('ignores the frame of a question, not its topic', () => {
    const r = ask('what kind of consulting do you do?');
    expect(r.type === 'answer' && r.entry.id).toBe('consulting');
  });

  it('expands synonyms only for entries that already use the group', () => {
    const r = ask('what are your fees');
    expect(r.type === 'answer' && r.entry.id).toBe('pricing');
    // "fees" is a price word; the consulting entry never used one, so it is not pulled in.
    expect(ask('fees') .type).not.toBe('fallback');
  });

  it('matches code / coding and price / pricing through the stemmer', () => {
    const r = ask('how do I learn to code');
    expect(r.type === 'answer' && r.entry.id).toBe('learning');
    expect(ask('pricing').type).toBe('answer');
  });

  it('treats possessives like the base word and offers the choice for a bare topic', () => {
    const r = ask('cloudflare');
    expect(r.type).toBe('disambiguate');
    expect(r.type === 'disambiguate' && r.candidates.map((c) => c.id).sort()).toEqual(['cf-a', 'cf-b']);
  });

  it('does not answer unrelated questions just because a verb matched', () => {
    expect(ask('write me a poem about databases').type).toBe('fallback');
  });
});

describe('matching quality', () => {
  const e = (id: string, title: string, questions: string[], keywords: string[] = [], extra: Record<string, unknown> = {}) =>
    ({ id, language: 'en', title, questions, keywords, answer: 'x', sources: [], suggested: false, followUps: [], weight: 1, ...extra }) as never;
  const kb = validateKnowledge([
    e('legacy', 'Legacy projects', ['Can you work on a legacy codebase with no documentation?'], ['legacy', 'codebase']),
    e('privacy', 'Privacy', ['Does it collect any data?'], ['privacy', 'data']),
    e('migrations', 'Migrations', ['Can you migrate my store?'], ['migration', 'products']),
    e('homelab', 'Homelab', ['What do you self-host?'], ['self-hosting', 'homelab']),
    e('phone', 'Phone', ['What phone do you use?']),
    e('post-phone', 'Why I stopped my phone notifications', [], ['phone'], { weight: 0.7 }),
  ]);
  if (!kb.ok) throw new Error('fixture invalid');
  const engine = createEngine(kb.entries, 'en');
  const ask = (q: string) => respond(engine, initialState(), { type: 'text', text: q }).reply;

  it('keeps "40k" as one token instead of cutting it into 4 and 0k', () => {
    expect(tokenize('my 40k product store')).toContain('40k');
    expect(ask('can you move my 40k product store').type).toBe('answer');
  });

  it('looks past a negation that describes a situation, but not one that asks about a property', () => {
    expect(ask('we inherited a legacy codebase with no docs').type).toBe('answer');
    expect(ask('does it not collect data').type).not.toBe('answer');
  });

  it('finds a hyphenated word from its parts', () => {
    const r = ask('what do you self host');
    expect(r.type === 'answer' && r.entry.id).toBe('homelab');
  });

  it('lets a bulk-generated entry rank below the hand-written one', () => {
    const r = ask('which phone do you use');
    expect(r.type === 'answer' && r.entry.id).toBe('phone');
  });
});
