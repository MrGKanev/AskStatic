import config from 'virtual:askstatic/config';
import type { ConversationState, Engine, Entry, Reply } from '@mrgkanev/askstatic-core/runtime';
import { type Strings, stringsFor } from './strings.ts';

type Core = typeof import('@mrgkanev/askstatic-core/runtime');

interface Manifest {
  defaultLanguage: string;
  languages: Record<string, string>;
  pagefind: boolean;
}

type Message =
  | { from: 'user'; text: string }
  | { from: 'bot'; reply: Reply }
  | { from: 'site'; query: string };

interface Stored {
  messages: Message[];
  state: ConversationState;
}

const STYLE = `
:host { --a: var(--askstatic-accent, #2f5bea); --on-a: var(--askstatic-on-accent, #fff); --bg: var(--askstatic-bg, #fff); --fg: var(--askstatic-fg, #17191c);
  --muted: var(--askstatic-muted, #5c6370); --line: var(--askstatic-line, #e3e6ec); --soft: var(--askstatic-soft, #f3f4f7);
  --r: var(--askstatic-radius, 20px); font: 15px/1.5 var(--askstatic-font, system-ui, -apple-system, "Segoe UI", sans-serif); color: var(--fg); -webkit-font-smoothing: antialiased; }
@media (prefers-color-scheme: dark) { :host(:not([data-theme="light"])) { --a: var(--askstatic-accent, #8ea8ff); --on-a: var(--askstatic-on-accent, #0e1117); --bg: var(--askstatic-bg, #16181d);
  --fg: var(--askstatic-fg, #eceef2); --muted: var(--askstatic-muted, #a0a7b4); --line: var(--askstatic-line, #2b303a); --soft: var(--askstatic-soft, #232730); } }
:host([data-theme="dark"]) { --a: var(--askstatic-accent, #8ea8ff); --on-a: var(--askstatic-on-accent, #0e1117); --bg: var(--askstatic-bg, #16181d); --fg: var(--askstatic-fg, #eceef2);
  --muted: var(--askstatic-muted, #a0a7b4); --line: var(--askstatic-line, #2b303a); --soft: var(--askstatic-soft, #232730); }
* { box-sizing: border-box; }
[hidden] { display: none !important; }
button { font: inherit; color: inherit; cursor: pointer; }
svg { display: block; width: 1em; height: 1em; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
:focus-visible { outline: 3px solid var(--a); outline-offset: 2px; }
.launcher { position: fixed; right: 20px; bottom: 20px; z-index: 2147483000; display: flex; align-items: center; gap: 10px; min-height: 52px; padding: 0 20px 0 16px; border: 0; border-radius: 999px;
  background: var(--a); color: var(--on-a); font-weight: 600; box-shadow: 0 8px 24px -6px color-mix(in srgb, var(--a) 60%, transparent), 0 2px 6px rgb(0 0 0 / .12); transition: transform .15s ease, box-shadow .15s ease; }
.launcher:hover { transform: translateY(-2px); } .launcher svg { font-size: 22px; }
.panel { position: fixed; right: 20px; bottom: 84px; z-index: 2147483000; width: min(410px, calc(100vw - 32px)); height: min(640px, calc(100dvh - 108px));
  display: flex; flex-direction: column; background: var(--bg); border: 1px solid var(--line); border-radius: var(--r); box-shadow: 0 24px 60px -12px rgb(0 0 0 / .28), 0 4px 12px rgb(0 0 0 / .08); overflow: hidden; }
.panel[hidden] { display: none; }
header { display: flex; align-items: center; gap: 12px; padding: 14px 10px 14px 16px; border-bottom: 1px solid var(--line); }
.avatar { flex: none; display: grid; place-items: center; width: 36px; height: 36px; border-radius: 50%; background: var(--a); color: var(--on-a); font-size: 18px; }
.who { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.who b { font-weight: 650; font-size: 15px; line-height: 1.2; } .who small { color: var(--muted); font-size: 12.5px; line-height: 1.3; }
.close { flex: none; display: grid; place-items: center; width: 44px; height: 44px; border: 0; border-radius: 50%; background: none; color: var(--muted); font-size: 20px; }
.close:hover { background: var(--soft); color: var(--fg); }
.log { flex: 1; overflow-y: auto; padding: 16px 16px 8px; display: flex; flex-direction: column; gap: 14px; }
.row { display: flex; align-items: flex-end; gap: 8px; max-width: 100%; }
.row .avatar { width: 28px; height: 28px; font-size: 14px; }
.row.user { justify-content: flex-end; }
.bubbles { max-width: calc(100% - 38px); }
.msg { max-width: 100%; padding: 10px 14px; border-radius: 18px 18px 18px 6px; background: var(--soft); overflow-wrap: anywhere; }
.row.user .msg { max-width: 86%; background: var(--a); color: var(--on-a); border-radius: 18px 18px 6px 18px; }
.bubbles { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.msg p { margin: 0; } .msg p + p, .msg ul, .msg ol, .msg .chips, .msg .srcs, .msg .lead + p { margin-top: 8px; }
.msg .lead { color: var(--muted); font-size: 13px; }
.msg ul, .msg ol { margin-bottom: 0; padding-left: 20px; } .msg li + li { margin-top: 4px; }
.msg a { color: var(--a); } .msg code { padding: 1px 5px; border-radius: 5px; background: color-mix(in srgb, var(--fg) 10%, transparent); font-size: .9em; }
.label { margin: 10px 0 6px; color: var(--muted); font-size: 12px; font-weight: 600; letter-spacing: .02em; text-transform: uppercase; }
.srcs { display: flex; flex-direction: column; gap: 6px; }
.src { display: flex; align-items: center; justify-content: space-between; gap: 10px; min-height: 44px; padding: 8px 12px; border: 1px solid var(--line); border-radius: 12px; background: var(--bg); color: var(--fg) !important; text-decoration: none; font-weight: 500; font-size: 14px; transition: border-color .15s, transform .15s; }
.src:hover { border-color: var(--a); transform: translateX(2px); } .src svg { flex: none; color: var(--a); }
.src span { min-width: 0; } .src small { display: block; margin-top: 1px; color: var(--muted); font-weight: 400; font-size: 12px; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; }
.chip { min-height: 44px; padding: 6px 14px; border: 1px solid color-mix(in srgb, var(--a) 40%, var(--line)); border-radius: 999px; background: var(--bg); color: var(--fg); font-size: 14px; font-weight: 500; transition: background .15s, border-color .15s; }
.chip:hover { border-color: var(--a); background: color-mix(in srgb, var(--a) 10%, var(--bg)); } .chip[disabled] { opacity: .5; cursor: default; }
.starter { padding: 0 0 0 36px; } .starter .chips { margin: 0; }
.typing { display: flex; gap: 4px; padding: 14px 16px; } .typing i { width: 7px; height: 7px; border-radius: 50%; background: var(--muted); opacity: .55; }
.tools { display: flex; gap: 4px; padding: 0 12px 4px; }
.tool { min-height: 44px; padding: 0 10px; border: 0; border-radius: 8px; background: none; color: var(--muted); font-size: 13px; }
.tool:hover { background: var(--soft); color: var(--fg); }
form { display: flex; align-items: center; gap: 8px; margin: 8px 12px 6px; padding: 5px 5px 5px 16px; border: 1px solid var(--line); border-radius: 999px; background: var(--bg); transition: border-color .15s, box-shadow .15s; }
form:focus-within { border-color: var(--a); box-shadow: 0 0 0 3px color-mix(in srgb, var(--a) 22%, transparent); }
input { flex: 1; min-width: 0; min-height: 44px; padding: 0; border: 0; outline: 0; background: none; color: var(--fg); font: inherit; }
input:focus-visible { outline: 0; }
input::placeholder { color: var(--muted); }
.send { flex: none; display: grid; place-items: center; width: 44px; height: 44px; border: 0; border-radius: 50%; background: var(--a); color: var(--on-a); font-size: 18px; transition: transform .15s; } .send:hover { transform: scale(1.06); }
.note { margin: 0; padding: 0 16px calc(12px + env(safe-area-inset-bottom, 0px)); color: var(--muted); font-size: 11.5px; text-align: center; }
.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
@media (max-width: 480px) { .panel { right: 0; bottom: 0; width: 100vw; height: 88dvh; border-radius: var(--r) var(--r) 0 0; border-bottom: 0; } .launcher { right: 14px; bottom: 14px; } .launcher[aria-expanded="true"] { display: none; } }
@media (forced-colors: active) { .panel, .chip, .src, form, .launcher, .send { border: 1px solid CanvasText; } .msg { border: 1px solid CanvasText; } .row.user .msg { border-style: dashed; } .avatar { forced-color-adjust: none; background: Highlight; color: HighlightText; } :focus-visible { outline: 3px solid Highlight; } }
@media (prefers-reduced-motion: no-preference) {
  .panel { animation: rise .22s cubic-bezier(.2,.8,.2,1); } .row { animation: pop .25s ease-out; }
  .typing i { animation: blink 1.1s infinite; } .typing i:nth-child(2) { animation-delay: .15s; } .typing i:nth-child(3) { animation-delay: .3s; }
  @keyframes rise { from { opacity: 0; transform: translateY(12px) scale(.98); } } @keyframes pop { from { opacity: 0; transform: translateY(6px); } }
  @keyframes blink { 0%, 80%, 100% { opacity: .25; transform: none; } 40% { opacity: 1; transform: translateY(-3px); } }
}
`;

/** Only same-site paths and http(s) URLs may become links. */
function safeHref(url: string): string | undefined {
  try {
    const u = new URL(url, location.href);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : undefined;
  } catch {
    return undefined;
  }
}


const ICONS = {
  chat: 'M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z',
  spark: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8Z M19 16l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7Z',
  close: 'M6 6l12 12M18 6L6 18',
  send: 'M5 12h14M13 6l6 6-6 6',
  arrow: 'M7 17L17 7M8 7h9v9',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3',
} as const;

function icon(name: keyof typeof ICONS): SVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', ICONS[name]);
  svg.append(path);
  return svg;
}

function hash(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Inline **bold**, `code` and [text](url); everything is built from text nodes. */
function inline(text: string): DocumentFragment {
  const frag = document.createDocumentFragment();
  const re = /\*\*([^*]+)\*\*|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)/g;
  let last = 0;
  for (const m of text.matchAll(re)) {
    frag.append(text.slice(last, m.index));
    if (m[1]) frag.append(el('strong', '', m[1]));
    else if (m[2]) frag.append(el('code', '', m[2]));
    else {
      const href = safeHref(m[4] as string);
      if (href) {
        const a = el('a', '', m[3]) as HTMLAnchorElement;
        a.href = href;
        frag.append(a);
      } else frag.append(m[3] as string);
    }
    last = (m.index as number) + m[0].length;
  }
  frag.append(text.slice(last));
  return frag;
}

/** Paragraphs separated by blank lines; lines starting with "- " or "1. " become lists. */
function rich(text: string): HTMLElement[] {
  return text
    .trim()
    .split(/\n{2,}/)
    .map((block) => {
      const lines = block.split('\n');
      const ordered = lines.every((l) => /^\d+\.\s/.test(l));
      if (lines.every((l) => /^-\s/.test(l)) || ordered) {
        const list = el(ordered ? 'ol' : 'ul');
        for (const l of lines) {
          const li = el('li');
          li.append(inline(l.replace(ordered ? /^\d+\.\s/ : /^-\s/, '')));
          list.append(li);
        }
        return list;
      }
      const p = el('p');
      p.append(inline(lines.join(' ')));
      return p;
    });
}

function hostOf(url: string): string {
  try {
    const u = new URL(url, location.href);
    return u.origin === location.origin ? u.pathname : u.hostname;
  } catch {
    return '';
  }
}

class AskStatic extends HTMLElement {
  private root = this.attachShadow({ mode: 'open' });
  private ui!: Strings;
  private chatLang = 'en';
  private core?: Core;
  private engine?: Engine;
  private manifest?: Manifest;
  private loading?: Promise<void>;
  private messages: Message[] = [];
  private state?: ConversationState;
  private launcher!: HTMLButtonElement;
  private panel!: HTMLElement;
  private log!: HTMLElement;
  private input!: HTMLInputElement;
  private pagefind?: Promise<any>;
  private announcer!: HTMLElement;
  private clearBtn!: HTMLButtonElement;

  connectedCallback() {
    this.chatLang = (this.dataset.lang || document.documentElement.lang || 'en').toLowerCase().split('-')[0] as string;
    let overrides: Partial<Strings> | undefined;
    try {
      overrides = this.dataset.labels ? JSON.parse(this.dataset.labels) : undefined;
    } catch {}
    this.ui = stringsFor(this.chatLang, { ...(this.dataset.title ? { title: this.dataset.title } : {}), ...overrides });
    this.render();
    try {
      if (sessionStorage.getItem(`${this.storageKey}:open`)) this.open(true);
    } catch {}
  }

  private render() {
    const style = document.createElement('style');
    style.textContent = STYLE;

    this.launcher = el('button', 'launcher') as HTMLButtonElement;
    this.launcher.append(icon('chat'), el('span', '', this.ui.title));
    this.launcher.type = 'button';
    this.launcher.setAttribute('aria-expanded', 'false');
    this.launcher.setAttribute('aria-controls', 'panel');
    this.launcher.setAttribute('aria-haspopup', 'dialog');
    this.launcher.addEventListener('click', () => (this.panel.hidden ? this.open() : this.close()));

    this.panel = el('section', 'panel');
    this.panel.id = 'panel';
    this.panel.hidden = true;
    this.panel.setAttribute('role', 'dialog');
    this.panel.setAttribute('aria-modal', 'false');
    this.panel.setAttribute('aria-label', this.ui.title);
    this.panel.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Escape') {
        e.stopPropagation();
        this.close();
      }
    });

    const header = el('header');
    const who = el('div', 'who');
    who.append(el('b', '', this.ui.title), el('small', '', this.ui.subtitle));
    const badge = el('span', 'avatar');
    badge.append(icon('spark'));
    header.append(badge, who);
    this.clearBtn = el('button', 'close') as HTMLButtonElement;
    this.clearBtn.append(icon('trash'));
    this.clearBtn.type = 'button';
    this.clearBtn.hidden = true;
    this.clearBtn.title = this.ui.clear;
    this.clearBtn.setAttribute('aria-label', this.ui.clear);
    this.clearBtn.addEventListener('click', () => this.clearChat());
    header.append(this.clearBtn);
    const close = el('button', 'close') as HTMLButtonElement;
    close.append(icon('close'));
    close.type = 'button';
    close.setAttribute('aria-label', this.ui.close);
    close.addEventListener('click', () => this.close());
    header.append(close);

    this.log = el('div', 'log');
    // The log is re-rendered on every turn, so it must not be live itself: a separate status region announces only the newest reply.
    this.log.setAttribute('role', 'log');
    this.log.setAttribute('aria-live', 'off');
    this.log.setAttribute('aria-label', this.ui.log);
    this.log.tabIndex = 0;
    this.announcer = el('div', 'sr');
    this.announcer.setAttribute('role', 'status');
    this.announcer.setAttribute('aria-live', 'polite');
    this.announcer.setAttribute('aria-atomic', 'true');

    const form = el('form') as HTMLFormElement;
    this.input = el('input') as HTMLInputElement;
    this.input.type = 'text';
    this.input.placeholder = this.ui.placeholder;
    this.input.setAttribute('aria-label', this.ui.placeholder);
    this.input.autocomplete = 'off';
    this.input.enterKeyHint = 'send';
    const send = el('button', 'send') as HTMLButtonElement;
    send.append(icon('send'), el('span', 'sr', this.ui.send));
    send.type = 'submit';
    form.append(this.input, send);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = this.input.value.trim();
      if (!text) return;
      this.input.value = '';
      void this.ask({ type: 'text', text }, text);
    });

    this.panel.append(header, this.log, this.announcer, form, ...(this.ui.note ? [el('p', 'note', this.ui.note)] : []));
    this.root.append(style, this.launcher, this.panel);
  }

  private open(restoring = false) {
    this.panel.hidden = false;
    this.launcher.setAttribute('aria-expanded', 'true');
    try {
      sessionStorage.setItem(`${this.storageKey}:open`, '1');
    } catch {}
    // Re-opening after a page navigation must not steal focus from the new page.
    if (!restoring) this.input.focus();
    this.loading ??= this.load();
    this.loading.catch(() => {
      this.loading = undefined;
    });
  }

  private close() {
    try {
      sessionStorage.removeItem(`${this.storageKey}:open`);
    } catch {}
    this.panel.hidden = true;
    this.launcher.setAttribute('aria-expanded', 'false');
    this.launcher.focus();
  }

  private async load() {
    this.log.replaceChildren(el('p', 'msg', this.ui.loading));
    try {
      const noCache = { cache: 'no-cache' } as const;
      const manifest: Manifest = await (await fetch(`${config.packUrl}manifest.json`, noCache)).json();
      const lang = manifest.languages[this.chatLang] ? this.chatLang : manifest.defaultLanguage;
      this.chatLang = lang;
      const [core, data] = await Promise.all([
        import('@mrgkanev/askstatic-core/runtime'),
        fetch(`${config.packUrl}${manifest.languages[lang]}`).then((r) => {
          if (!r.ok) throw new Error(String(r.status));
          return r.json();
        }),
      ]);
      this.core = core;
      this.manifest = manifest;
      this.engine = core.loadEngine(data);
      this.restore();
      this.paintAll();
    } catch {
      const retry = el('button', 'chip', this.ui.retry) as HTMLButtonElement;
      retry.type = 'button';
      retry.addEventListener('click', () => {
        this.loading = this.load();
      });
      const box = el('div', 'msg');
      box.append(el('p', '', this.ui.loadFailed), retry);
      this.log.replaceChildren(box);
      throw new Error('askstatic: load failed');
    }
  }

  private get storageKey() {
    return `askstatic:${config.base}:${this.chatLang}`;
  }

  private restore() {
    const core = this.core as Core;
    try {
      const raw = sessionStorage.getItem(this.storageKey);
      if (raw) {
        const stored = JSON.parse(raw) as Stored;
        this.messages = stored.messages;
        this.state = stored.state;
        return;
      }
    } catch {}
    this.state = core.initialState();
    this.messages = [];
  }

  private persist() {
    try {
      sessionStorage.setItem(this.storageKey, JSON.stringify({ messages: this.messages.slice(-40), state: this.state }));
    } catch {}
  }

  private chain: Promise<void> = Promise.resolve();
  private typing = false;

  private ask(input: Parameters<Core['respond']>[2], label?: string): Promise<void> {
    // A question sent while the engine is still loading is queued instead of dropped.
    if ((!this.engine || !this.core || !this.state) && this.loading) return this.loading.then(() => this.ask(input, label), () => undefined);
    if (!this.engine || !this.core || !this.state) return Promise.resolve();
    if (label) this.messages.push({ from: 'user', text: label });
    const { reply, state } = this.core.respond(this.engine, this.state, input);
    this.state = state;
    const instant = input.type === 'back' || matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (input.type === 'back') {
      // Drop the last turn: everything after (and including) the most recent user message.
      while (this.messages.length) {
        if (this.messages.pop()?.from === 'user') break;
      }
      this.persist();
      this.paintAll();
      return Promise.resolve();
    }
    this.persist();
    this.typing = !instant;
    this.paintAll();
    this.chain = this.chain.then(async () => {
      if (!instant) await new Promise((r) => setTimeout(r, 380 + Math.min(500, (reply.type === 'answer' ? (reply.entry.answer ?? '').length : 40) * 3)));
      this.messages.push({ from: 'bot', reply });
      this.announce(reply);
      if (reply.type === 'fallback' && this.manifest?.pagefind && input.type === 'text') {
        this.messages.push({ from: 'site', query: input.text });
      }
      this.typing = false;
      this.persist();
      this.paintAll();
    });
    return this.chain;
  }

  /** Wipes the conversation and the saved session; the greeting and starter chips come back. */
  private clearChat() {
    if (!this.core) return;
    this.messages = [];
    this.state = this.core.initialState();
    this.typing = false;
    try {
      sessionStorage.removeItem(this.storageKey);
    } catch {}
    this.paintAll();
    this.announcer.textContent = this.ui.cleared;
    this.input.focus();
  }

  private announce(reply: Reply) {
    const plain = (t: string) => t.replace(/\*\*|`/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/^[-\d.]+\s/gm, '').replace(/\s+/g, ' ').trim();
    let text = '';
    if (reply.type === 'answer') text = plain(reply.entry.answer ?? reply.entry.title);
    else if (reply.type === 'clarify') text = reply.question;
    else if (reply.type === 'disambiguate') text = this.ui.didYouMean;
    else if (reply.type === 'fallback') text = this.ui.noMatch;
    // Re-set after a tick so identical consecutive replies are still announced.
    this.announcer.textContent = '';
    setTimeout(() => (this.announcer.textContent = text.slice(0, 400)), 50);
  }

  private paintAll() {
    this.clearBtn.hidden = !this.messages.length;
    this.log.replaceChildren();
    this.log.append(this.botRow(this.botBox(this.ui.greeting)));
    if (!this.messages.length) this.log.append(this.starters());
    const lastBot = this.lastBotIndex();
    this.messages.forEach((m, i) => {
      if (m.from === 'user') {
        const row = el('div', 'row user');
        const bubble = el('div', 'msg');
        bubble.append(el('span', 'sr', this.ui.youSaid), m.text);
        row.append(bubble);
        this.log.append(row);
      }
      else if (m.from === 'bot') this.log.append(this.botRow(this.replyBox(m.reply, i === lastBot && !this.typing)));
      else this.log.append(this.botRow(this.siteBox(m.query)));
    });
    if (this.typing) {
      const dots = el('div', 'msg typing');
      dots.setAttribute('aria-hidden', 'true');
      dots.append(el('i'), el('i'), el('i'));
      this.log.append(this.botRow(dots));
    }
    this.log.append(this.tools());
    // A long answer should be read from its first line, not its last.
    const rows = this.log.querySelectorAll<HTMLElement>('.row.bot');
    const lastRow = rows[rows.length - 1];
    const tall = lastRow && !this.typing && lastRow.offsetHeight > this.log.clientHeight - 24;
    this.log.scrollTop = tall
      ? lastRow.getBoundingClientRect().top - this.log.getBoundingClientRect().top + this.log.scrollTop - 12
      : this.log.scrollHeight;
  }

  private botRow(...content: HTMLElement[]): HTMLElement {
    const row = el('div', 'row bot');
    const av = el('span', 'avatar');
    av.append(icon('spark'));
    const stack = el('div', 'bubbles');
    content[0]?.prepend(el('span', 'sr', this.ui.assistantSaid));
    stack.append(...content);
    row.append(av, stack);
    return row;
  }

  private starters(): HTMLElement {
    const box = el('div', 'starter');
    const chips = this.suggestionChips();
    if (chips) box.append(chips);
    return box;
  }

  private lastBotIndex() {
    for (let i = this.messages.length - 1; i >= 0; i--) if (this.messages[i]?.from === 'bot') return i;
    return -1;
  }

  private entries(): Entry[] {
    return (this.engine as Engine).entries;
  }

  private suggestionChips(): HTMLElement | undefined {
    const engine = this.engine as Engine;
    const top = this.entries().filter((e) => !engine.parentOf(e.id));
    const picked = top.filter((e) => e.suggested);
    const list = (picked.length ? picked : top).slice(0, 4);
    return this.chips(list.map((e) => ({ label: e.title, run: () => this.ask({ type: 'pick', entryId: e.id }, e.title) })));
  }

  private chips(items: { label: string; run: () => void }[], disabled = false): HTMLElement | undefined {
    if (!items.length) return undefined;
    const box = el('div', 'chips');
    for (const item of items) {
      const b = el('button', 'chip', item.label) as HTMLButtonElement;
      b.type = 'button';
      b.disabled = disabled;
      b.addEventListener('click', item.run);
      box.append(b);
    }
    return box;
  }

  private botBox(text: string | undefined, ...extra: (HTMLElement | undefined)[]): HTMLElement {
    const box = el('div', 'msg');
    if (text) box.append(el('p', '', text));
    for (const x of extra) if (x) box.append(x);
    return box;
  }

  private replyBox(reply: Reply, live: boolean): HTMLElement {
    const ui = this.ui;
    switch (reply.type) {
      case 'start':
        return this.botBox(ui.greeting, this.suggestionChips());
      case 'answer': {
        const box = el('div', 'msg');
        const leads = ui.leadIns.split('|').filter(Boolean);
        const lead = leads.length ? leads[hash(reply.entry.id) % leads.length] : '';
        if (lead) box.append(el('p', 'lead', lead));
        box.append(...rich(reply.entry.answer ?? reply.entry.title));
        if (reply.entry.sources.length) {
          box.append(el('div', 'label', ui.sources));
          const list = el('div', 'srcs');
          for (const s of reply.entry.sources) {
            const href = safeHref(s.url);
            if (!href) continue;
            const a = el('a', 'src') as HTMLAnchorElement;
            a.href = href;
            const text = el('span', '', s.title);
            text.append(el('small', '', hostOf(s.url)));
            a.append(text, icon('arrow'));
            list.append(a);
          }
          box.append(list);
        }
        const entry = reply.entry;
        const clar = reply.clarification;
        const clarChips = clar
          ? this.chips(clar.choices.map((c) => ({ label: c.label, run: () => this.ask({ type: 'choice', entryId: entry.id, value: c.value }, c.label) })), !live)
          : undefined;
        if (clar && clarChips) box.append(el('div', 'label', clar.question), clarChips);
        const follow = this.chips(reply.followUps.map((f) => ({ label: f.title, run: () => this.ask({ type: 'pick', entryId: f.id }, f.title) })), !live);
        if (follow) box.append(el('div', 'label', ui.followUp), follow);
        return box;
      }
      case 'clarify': {
        const entry = reply.entry;
        return this.botBox(reply.question, this.chips(reply.choices.map((c) => ({ label: c.label, run: () => this.ask({ type: 'choice', entryId: entry.id, value: c.value }, c.label) })), !live));
      }
      case 'disambiguate': {
        const note = reply.reason === 'negation' ? ui.negationNote : reply.reason === 'number-mismatch' ? ui.numberNote : ui.didYouMean;
        return this.botBox(note, this.chips(reply.candidates.map((c) => ({ label: c.title, run: () => this.ask({ type: 'pick', entryId: c.id }, c.title) })), !live));
      }
      case 'fallback':
        return this.botBox(reply.reason === 'clarification-failed' ? ui.clarificationFailed : ui.noMatch, live ? this.suggestionChips() : undefined);
    }
  }

  private siteBox(query: string): HTMLElement {
    const box = el('div', 'msg', this.ui.searching);
    box.setAttribute('role', 'status');
    void this.searchSite(query).then((results) => {
      box.replaceChildren();
      if (!results.length) return (box.closest('.row') ?? box).remove();
      box.append(el('div', 'label', this.ui.siteResults));
      const ul = el('div', 'srcs');
      for (const r of results) {
        const a = el('a', 'src') as HTMLAnchorElement;
        a.href = r.href;
        const text = el('span', '', r.title);
        if (r.excerpt) text.append(el('small', '', r.excerpt.length > 110 ? `${r.excerpt.slice(0, 110)}…` : r.excerpt));
        a.append(text, icon('arrow'));
        ul.append(a);
      }
      box.append(ul);
    }, () => (box.closest('.row') ?? box).remove());
    return box;
  }

  private async searchSite(query: string): Promise<{ title: string; href: string; excerpt: string }[]> {
    this.pagefind ??= import(/* @vite-ignore */ `${config.base}pagefind/pagefind.js`).then(async (pf) => {
      await pf.options({ basePath: `${config.base}pagefind/` });
      return pf;
    });
    const pf = await this.pagefind;
    const found = await pf.search(query);
    const out = [];
    for (const r of found.results.slice(0, 3)) {
      const d = await r.data();
      const href = safeHref(d.url);
      if (!href) continue;
      // Pagefind excerpts contain <mark> markup; keep text only.
      const excerpt = new DOMParser().parseFromString(d.excerpt ?? '', 'text/html').body.textContent ?? '';
      out.push({ title: d.meta?.title || d.url, href, excerpt });
    }
    return out;
  }

  private tools(): HTMLElement {
    const box = el('div', 'tools');
    if (this.state?.history.length) {
      const back = el('button', 'tool', this.ui.back) as HTMLButtonElement;
      back.type = 'button';
      back.addEventListener('click', () => void this.ask({ type: 'back' }));
      box.append(back);
    }
    if (this.messages.length) {
      const other = el('button', 'tool', this.ui.otherTopic) as HTMLButtonElement;
      other.type = 'button';
      other.addEventListener('click', () => void this.ask({ type: 'reset' }, this.ui.otherTopic));
      box.append(other);
    }
    return box;
  }
}

function el(tag: string, cls = '', text = ''): HTMLElement {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text) node.textContent = text;
  return node;
}

if (!customElements.get('ask-static')) customElements.define('ask-static', AskStatic);
