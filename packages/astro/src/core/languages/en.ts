import type { LanguagePack } from './types.ts';

const stopwords = new Set(
  `a an the is are was were be been am do does did can could should would will shall may might
   i me my we our you your it its they them their he she his her this that these those
   how what which who whom whose when where why
   to of in on at for from by with about into as and or but if so than then
   please tell show give want need get
   what's that's it's there's here's who's how's let's
   kind kinds type types sort sorts way ways thing things stuff many lot lots bit couple few some any anyone someone
   like really actually just also very quite looking interested wondering curious hello hey hi thanks thank
   take takes happen happened happens post posts article articles
   have has had having write writes wrote written writing
   asap pls plz thx ok okay going up`.split(/\s+/),
);

const negations = new Set(
  ["no", "not", "without", "never", "cannot", "cant", "can't", "don't", "dont", "doesn't", "doesnt", "won't", "wont", "isn't", "isnt", "aren't", "arent", "none", "nothing"],
);

function stem(rawToken: string): string {
  // Possessives: "Cloudflare's" must meet "cloudflare".
  const token = rawToken.endsWith("'s") && rawToken.length > 4 ? rawToken.slice(0, -2) : rawToken;
  if (token.length <= 3 || /\p{N}/u.test(token)) return token;
  if (token.endsWith('ies') && token.length > 4) return `${token.slice(0, -3)}y`;
  if (token.endsWith('sses')) return token.slice(0, -2);
  let t = token;
  if (t.endsWith('ing') && t.length > 5) t = t.slice(0, -3);
  else if (t.endsWith('ed') && t.length > 4) t = t.slice(0, -2);
  else if (t.endsWith('s') && !t.endsWith('ss') && !t.endsWith('us')) t = t.slice(0, -1);
  // price / prices / pricing and code / coding must meet in the middle.
  if (t.endsWith('e') && t.length > 3) t = t.slice(0, -1);
  return t;
}

const synonyms = [
  ['price', 'prices', 'pricing', 'cost', 'costs', 'rate', 'rates', 'fee', 'fees', 'charge', 'charges', 'quote', 'estimate', 'budget', 'expensive', 'cheap', 'affordable'],
  ['pay', 'paid', 'payment', 'payments', 'paypal', 'revolut', 'invoice', 'money', 'donate', 'donation'],
  ['contact', 'email', 'mail', 'message', 'reach', 'touch'],
  ['hire', 'hiring', 'engage', 'freelance', 'freelancer', 'available', 'availability', 'book', 'booking'],
  ['slow', 'slowly', 'speed', 'fast', 'faster', 'performance', 'load', 'loading', 'laggy'],
  ['hacked', 'hack', 'malware', 'infected', 'compromised', 'breach', 'virus'],
  ['security', 'secure', 'vulnerability', 'vulnerabilities', 'exploit'],
  ['refund', 'refunds', 'reimburse', 'reimbursement'],
  ['docs', 'documentation', 'manual', 'guide', 'tutorial', 'handbook'],
  ['install', 'installation', 'setup', 'configure', 'configuration'],
  ['buy', 'purchase', 'order', 'checkout'],
  ['cancel', 'cancellation', 'unsubscribe', 'terminate'],
  ['university', 'college', 'degree', 'education', 'academic', 'school'],
  ['location', 'located', 'based', 'live', 'lives', 'address'],
  ['speak', 'speaking', 'speaker', 'talk', 'talks', 'conference', 'keynote', 'lecture'],
  ['sponsor', 'sponsorship', 'advertise', 'advertising', 'ads'],
  ['privacy', 'gdpr', 'cookies', 'tracking'],
  ['help', 'assist', 'assistance', 'support'],
  ['phd', 'doctorate', 'doctoral', 'dissertation', 'thesis', 'defense', 'defence'],
  ['phone', 'smartphone', 'mobile', 'handset', 'iphone', 'android', 'pixel'],
  ['ai', 'llm', 'llms', 'chatgpt', 'gpt', 'claude', 'copilot', 'gemini', 'genai', 'chatbot'],
  ['accessibility', 'accessible', 'a11y', 'wcag', 'blind', 'disability', 'disabled', 'impaired', 'inclusive', 'inclusion'],
  ['audit', 'review', 'assessment', 'inspection', 'checkup'],
  ['report', 'writeup', 'findings', 'deliverable', 'documentation'],
  ['hobby', 'hobbies', 'weekend', 'weekends', 'leisure', 'spare'],
  ['homelab', 'selfhost', 'selfhosted', 'selfhosting', 'nas', 'raspberry'],
  ['research', 'paper', 'papers', 'publication', 'publications', 'journal', 'study', 'studies'],
  ['book', 'books', 'ebook', 'read', 'reading'],
  ['call', 'meeting', 'chat', 'talk', 'session', 'appointment', 'schedule', 'calendar'],
  ['roadmap', 'strategy', 'priorities', 'prioritize', 'backlog', 'planning', 'workshop'],
  ['migration', 'migrate', 'move', 'moving', 'switch', 'transfer', 'replatform'],
  ['team', 'teammates', 'colleagues', 'coworkers', 'collaborate', 'collaboration'],
  ['finish', 'finished', 'complete', 'completed', 'graduate', 'graduated'],
  ['slow', 'forever', 'lag', 'sluggish', 'delay', 'delayed'],
  ['small', 'quick', 'short', 'brief', 'minor', 'tiny'],
] as const;

const framePhrases = [
  /^\s*(?:hi|hey|hello|dear|good (?:morning|afternoon|evening))\b[^,.!?]{0,20}[,!.]\s*/i,
  /\bquick question\b/gi,
  /\b(?:i was|i am|i'm) (?:just )?wondering (?:if|whether|about)?\b/gi,
  /\bjust (?:wondering|curious)\b/gi,
  /\bby the way\b/gi,
  /\bthanks?(?: in advance| a lot| so much)?\b/gi,
  /\bhi there\b/gi,
];

export const en: LanguagePack = { code: 'en', stopwords, negations, stem, synonyms, framePhrases };
