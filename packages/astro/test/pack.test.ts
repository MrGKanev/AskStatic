import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadEngine, validateKnowledge } from '../src/core/index.ts';
import { describe, expect, it } from 'vitest';
import { loadKnowledge } from '../src/knowledge.ts';
import { findBrokenSources } from '../src/links.ts';
import { optionsSchema } from '../src/options.ts';
import { buildPack, withBase } from '../src/pack.ts';

const entry = (id: string, language: string, url = '/a/') => ({ id, language, title: id, questions: [`what is ${id}`], answer: 'x', sources: [{ title: 't', url }] });
const opts = optionsSchema.parse({});

describe('withBase', () => {
  it('joins without doubling slashes', () => {
    expect(withBase('/', '/x/')).toBe('/x/');
    expect(withBase('/docs/', 'x')).toBe('/docs/x');
    expect(withBase('/docs', '_askstatic/')).toBe('/docs/_askstatic/');
  });
});

describe('buildPack', () => {
  const { entries } = validateKnowledge([entry('a', 'en'), entry('a', 'bg'), entry('b', 'en-US')]);
  it('builds one hashed file per language plus a manifest', () => {
    const pack = buildPack(entries, opts, '/', true);
    expect(pack.languages.sort()).toEqual(['bg', 'en']);
    const manifest = JSON.parse(pack.files.get('manifest.json') as string);
    expect(manifest.pagefind).toBe(true);
    expect(manifest.languages.en).toMatch(/^en\.[0-9a-f]{10}\.json$/);
  });
  it('is deterministic', () => {
    const a = buildPack(entries, opts, '/', false);
    const b = buildPack(entries, opts, '/', false);
    expect([...a.files]).toEqual([...b.files]);
  });
  it('rebases internal source urls on a non-root base', () => {
    const pack = buildPack(entries, opts, '/site', false);
    const manifest = JSON.parse(pack.files.get('manifest.json') as string);
    const engine = loadEngine(JSON.parse(pack.files.get(manifest.languages.en) as string));
    expect(engine.get('a')?.sources[0]?.url).toBe('/site/a/');
  });
});

describe('loadKnowledge', () => {
  it('reads json and yaml, skips _files, reports parse errors', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'askstatic-'));
    mkdirSync(join(dir, 'k'));
    writeFileSync(join(dir, 'k', 'one.yaml'), 'id: a\nlanguage: en\ntitle: A\nanswer: x\n');
    writeFileSync(join(dir, 'k', 'many.json'), JSON.stringify([entry('b', 'en'), entry('c', 'en')]));
    writeFileSync(join(dir, 'k', '_draft.yaml'), 'id: nope');
    writeFileSync(join(dir, 'k', 'broken.json'), '{');
    const r = await loadKnowledge(join(dir, 'k'), dir);
    expect(r.items).toHaveLength(3);
    expect(r.errors).toHaveLength(1);
    expect((await loadKnowledge(join(dir, 'missing'), dir)).errors[0]).toMatch(/not found/);
  });
});

describe('findBrokenSources', () => {
  it('flags internal links without a built page, ignores external ones', () => {
    const out = mkdtempSync(join(tmpdir(), 'askstatic-out-'));
    mkdirSync(join(out, 'ok'));
    writeFileSync(join(out, 'ok', 'index.html'), '');
    writeFileSync(join(out, 'flat.html'), '');
    const { entries } = validateKnowledge([entry('ok', 'en', '/ok/#part'), entry('flat', 'en', '/flat'), entry('bad', 'en', '/nope/'), entry('ext', 'en', 'https://example.com/x')]);
    expect(findBrokenSources(entries, out, '/')).toEqual(['bad: source "/nope/" does not exist in the build output']);
  });
});

describe('options', () => {
  it('rejects unknown options and bad values', () => {
    expect(optionsSchema.safeParse({ knowlege: 'x' }).success).toBe(false);
    expect(optionsSchema.safeParse({ outputDir: '../x' }).success).toBe(false);
  });
});
