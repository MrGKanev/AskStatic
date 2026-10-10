export interface LanguagePack {
  code: string;
  /** Words that carry little meaning. Kept in the index; only ignored when measuring how much of a query was matched. */
  stopwords: ReadonlySet<string>;
  /** Words that flip meaning. Never removed; queries containing them are never answered "confidently" without an exact match. */
  negations: ReadonlySet<string>;
  /** Light, conservative stemming applied to indexed and query tokens (already lower-cased). */
  stem(token: string): string;
  /** Groups of interchangeable words (price/cost/fee). Applied at build time: an entry that already contains one word of a group also gets the others added to its search keywords. */
  synonyms?: readonly (readonly string[])[];
  /** Optional second search channel: converts text typed in another script (e.g. Latin-typed Bulgarian) to the language's own script. */
  transliterate?(text: string): string;
}
