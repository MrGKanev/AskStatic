import { readFileSync } from 'node:fs';
import { createEngine, initialState, respond, validateKnowledge } from '../src/core/index.ts';

type Expect = 'answer' | 'clarify' | 'fallback' | 'guarded' | 'any';
interface Q { q: string; expect: Expect; id?: string }

const load = (p: string) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const lang = process.argv[2] ?? 'en';
const kb = validateKnowledge(load(`../test/fixtures/${lang}-kb.json`));
if (!kb.ok) { console.error(kb.issues); process.exit(1); }
const engine = createEngine(kb.entries, lang);
const questions: Q[] = load(`./questions.${lang}.json`);

let correct = 0, wrongConfident = 0;
const failures: string[] = [];
for (const { q, expect, id } of questions) {
  const { reply } = respond(engine, initialState(), { type: 'text', text: q });
  const got = reply.type === 'answer' ? `answer:${reply.entry.id}` : reply.type === 'clarify' ? `clarify:${reply.entry.id}` : reply.type;
  const wantsId = id ? `${expect}:${id}` : expect;
  // "guarded" = must not give a confident answer; asking for confirmation, disambiguating or falling back are all fine.
  const ok =
    expect === 'guarded' ? reply.type !== 'answer' && reply.type !== 'clarify' :
    expect === 'fallback' ? reply.type === 'fallback' :
    expect === 'any' ? true :
    got === wantsId;
  const confidentWrong = (reply.type === 'answer' || reply.type === 'clarify') && expect !== 'any' && got !== wantsId;
  if (ok) correct++; else failures.push(`  ${confidentWrong ? 'WRONG ' : 'MISS  '} "${q}" -> ${got} (wanted ${wantsId})`);
  if (confidentWrong) wrongConfident++;
}
console.log(`[${lang}] questions: ${questions.length}  correct: ${correct} (${((100 * correct) / questions.length).toFixed(1)}%)  confident-wrong: ${wrongConfident}`);
if (failures.length) console.log(failures.join('\n'));
process.exitCode = wrongConfident > 1 || correct / questions.length < 0.85 ? 1 : 0;
