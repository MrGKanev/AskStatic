import type { LanguagePack } from './types.ts';

const stopwords = new Set(
  `е са съм си сме сте бъде бях беше ще да ли се си ми ни ви им ти аз ние вие те той тя то
   как какво кой коя кое кои къде кога защо колко
   на в във от за с със по при до като и или но ако че този тази това тези
   моля искам трябва мога може можем`.split(/\s+/),
);

const negations = new Set(['не', 'без', 'нито', 'никога', 'нямам', 'няма', 'невъзможно']);

// Longest first. Only definite articles and common plural endings; deliberately conservative.
const suffixes = ['ите', 'ата', 'ият', 'ето', 'ът', 'ят', 'та', 'то', 'те', 'ци', 'ове', 'и', 'а', 'я'];

function stem(token: string): string {
  if (token.length <= 4 || /\p{N}/u.test(token) || !/\p{Script=Cyrillic}/u.test(token)) return token;
  for (const suffix of suffixes) {
    if (token.endsWith(suffix) && token.length - suffix.length >= 4) {
      return token.slice(0, -suffix.length);
    }
  }
  return token;
}

const DIGRAPHS: [string, string][] = [
  ['sht', 'щ'], ['sh', 'ш'], ['ch', 'ч'], ['zh', 'ж'], ['ts', 'ц'], ['yu', 'ю'], ['ya', 'я'], ['ju', 'ю'], ['ja', 'я'],
];
const SINGLE: Record<string, string> = {
  a: 'а', b: 'б', v: 'в', w: 'в', g: 'г', d: 'д', e: 'е', z: 'з', i: 'и', j: 'й', k: 'к', l: 'л', m: 'м', n: 'н', o: 'о',
  p: 'п', r: 'р', s: 'с', t: 'т', u: 'у', f: 'ф', h: 'х', c: 'ц', y: 'й', x: 'кс', q: 'к',
};

/** Phonetic Latin -> Cyrillic. Ambiguous by nature (e.g. "a" may be "ъ"); it only feeds a second search attempt. */
function transliterate(text: string): string {
  const s = text.toLowerCase();
  let out = '';
  for (let i = 0; i < s.length; ) {
    const pair = DIGRAPHS.find(([lat]) => s.startsWith(lat, i));
    if (pair) {
      out += pair[1];
      i += pair[0].length;
    } else {
      out += SINGLE[s[i] as string] ?? s[i];
      i += 1;
    }
  }
  return out;
}

export const bg: LanguagePack = { code: 'bg', stopwords, negations, stem, transliterate };
