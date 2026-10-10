import type { LanguagePack } from './types.ts';

const stopwords = new Set(
  `a an the is are was were be been am do does did can could should would will shall may might
   i me my we our you your it its they them their he she his her this that these those
   how what which who whom whose when where why
   to of in on at for from by with about into as and or but if so than then
   please tell show give want need get
   what's that's it's there's here's who's how's let's`.split(/\s+/),
);

const negations = new Set(
  ["no", "not", "without", "never", "cannot", "cant", "can't", "don't", "dont", "doesn't", "doesnt", "won't", "wont", "isn't", "isnt", "aren't", "arent", "none", "nothing"],
);

function stem(token: string): string {
  if (token.length <= 3 || /\p{N}/u.test(token)) return token;
  if (token.endsWith('ies') && token.length > 4) return `${token.slice(0, -3)}y`;
  if (token.endsWith('sses')) return token.slice(0, -2);
  if (token.endsWith('ing') && token.length > 5) return token.slice(0, -3);
  if (token.endsWith('ed') && token.length > 4) return token.slice(0, -2);
  if (token.endsWith('s') && !token.endsWith('ss') && !token.endsWith('us')) return token.slice(0, -1);
  return token;
}

export const en: LanguagePack = { code: 'en', stopwords, negations, stem };
