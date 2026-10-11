# Human-free eval generation for AskStatic

Status: research and design, 2026-10-11. Nothing here is implemented. Every external claim has a URL that was opened during this research; items I could not verify are marked **UNVERIFIED**.

Limits of this document:

- `MATCHING-RESEARCH.md` is referenced by `ACTION-PLAN.md` but **does not exist in the repo** (checked with `ls` and `find`; git log shows commit 98fdfeb mentions it). The taxonomy below therefore comes from the task brief, `ACTION-PLAN.md` ("Matching quality") and `ONBOARDING-PLAN.md` sections 1.7 and 4. Reconcile with that file when it is found.
- Cost and runtime numbers in section 3.9 are my own estimates, not measurements.

## 0. Grounding in the current code

- Runner: `packages/astro/eval/run-site.ts`. Format `{q, expect, id}`, `expect` in `answer|topic|clarify|fallback|guarded|any`. It destructures only `q, expect, id`, so **extra JSON fields are ignored today** and can be added without breaking it.
- Existing gkanev sets (counted by script): `en.json` 98 questions (83 answer, 7 topic, 4 guarded, 4 fallback; no `clarify`), `en.heldout.json` 70 (45 answer, 15 topic, 6 fallback, 4 guarded). Both written by the author of the knowledge. 91 yaml files in `src/askstatic/en/`, entries have `questions`, `keywords`, `answer`, `sources`, `followUps`.
- Runner exit rule: `confidentWrong > 1` fails. Metric that matters most is confident-wrong.
- Gap in the runner relevant here: no per-`type` breakdown, no split handling.

## 1. Ready-made data

### 1.1 How a labelled-intent dataset becomes an engine benchmark

An intent dataset is `{utterance, intent}`. Convert it into a synthetic site:

1. Each intent becomes one knowledge entry: `id = intent`, `title` = humanised intent name, `answer` = placeholder (`"Answer for <intent>"`), `questions` = a small sample (k = 3 or 5) of that intent's training utterances (simulates an owner who wrote a few examples), `keywords` empty (stress test) or filled by the build-time extractor.
2. Held-out utterances of the same intent become `{q, expect: "answer", id: intent}`. Because intent granularity is finer than a real FAQ, also emit a lenient variant `expect: "topic"`.
3. Out-of-scope utterances (CLINC) become `{q, expect: "fallback"}`.
4. Sub-sample 75 intents to mimic a real site size, and repeat with several random seeds (report mean and spread).

This benchmarks the engine independent of any site. Weakness: utterances are voice-assistant or banking style, shorter and cleaner than visitor questions on a personal or business site; the placeholder answers mean answer text is not exercised.

### 1.2 Datasets, verified facts

| Dataset | Content (verified) | Size | Licence | Languages | Source opened |
|---|---|---|---|---|---|
| Banking77 | customer-service queries, 77 intents | 10,003 train, 3,080 test | CC-BY-4.0 | English | https://huggingface.co/datasets/PolyAI/banking77 , https://github.com/PolyAI-LDN/task-specific-datasets (dir `banking_data`) |
| CLINC150 (clinc_oos) | 150 intents in 10 domains plus out-of-scope; OOS: 100 in train/val, 1,000 in test; crowdsourced, single-intent only | 59,275 rows over 3 HF subsets (small, imbalanced, plus) | CC-BY-3.0 (HF card) | English | https://huggingface.co/datasets/clinc/clinc_oos , https://github.com/clinc/oos-eval (`data/data_full.json`) |
| MFAQ | 6.35M real FAQ question-answer pairs from 1.04M pages, parsed from Common Crawl `FAQPage` markup, fields domain/question/answer/language | 2.19 GB | CC0 for the packaging (individual page content copyright unaddressed on the card) | 21 languages, **no Bulgarian** | https://huggingface.co/datasets/clips/mfaq |
| COUGH | FAQ bank 15,919 items from 55 sites; 1,201 human-paraphrased user queries; 39,760 annotated query-FAQ pairs | CSV, small | CC BY-NC-SA 4.0, "research and education only" | English | https://github.com/sunlab-osu/covid-faq , paper https://arxiv.org/pdf/2010.12800 |
| HWU64 / NLU-Evaluation-Data | ~25k home-robot utterances, 64 intents (HF mirror: 10,158 rows) | CSV, semicolon-delimited | CC BY 4.0 (GitHub). The DeepPavlov mirror card states no licence | English | https://github.com/xliuhw/NLU-Evaluation-Data , https://huggingface.co/datasets/DeepPavlov/hwu64 |
| MASSIVE 1.1 | 60 intents, 18 domains, >1M utterances parallel over 52 languages | 11,514 train, 2,033 dev, 2,974 test per language | CC-BY-4.0 | 52 languages, **Bulgarian is not in the list** | https://huggingface.co/datasets/AmazonScience/massive |
| Quora Question Pairs (sentence-transformers repack) | duplicate/non-duplicate question pairs | 3.4M+ rows, 161 MB | **no licence stated on the card**; original Quora Kaggle terms not checked | English | https://huggingface.co/datasets/sentence-transformers/quora-duplicates |
| MS MARCO | real Bing queries with human answers | 1.1M rows (v1.1 + v2.1) | card says "More Information Needed" | not stated | https://huggingface.co/datasets/microsoft/ms_marco |
| Natural Questions | real Google queries with Wikipedia pages | 307k train, 7.8k val; 45 GB | CC-BY-SA-3.0 | English | https://huggingface.co/datasets/google-research-datasets/natural_questions |
| GitHub Typo Corpus | >350k edits, 65M characters, >15 languages (detail for en, zh, ja) | JSONL | follows each source repo's licence | multilingual, Bulgarian coverage not stated | https://github.com/mhagiwara/github-typo-corpus |
| bgGLUE | Bulgarian NLU benchmark: NLI, fact-checking, NER, sentiment, QA | n/a | per task, **not verified** (page returned 401) | Bulgarian | via search result https://arxiv.org/pdf/2306.02349 |
| WikipediaRetrievalMultilingual (MTEB) | **LLM-generated** queries over Wikipedia passages, 16 languages incl. Bulgarian | ~1,500 queries and ~13,500 docs per language | CC-BY-SA-3.0 | includes Bulgarian | https://huggingface.co/datasets/mteb/WikipediaRetrievalMultilingual |
| opus-mt-en-bg (translator) | MT model en to bg, also `bul_Latn` target token | model | Apache 2.0 | en to bg | https://huggingface.co/Helsinki-NLP/opus-mt-en-bg |
| NLLB-200 distilled 600M (translator) | 196 languages incl. `bul_Cyrl` | model | **CC-BY-NC-4.0**, "research model, not for production" | incl. Bulgarian | https://huggingface.co/facebook/nllb-200-distilled-600M |

Not verified at all in this research: ORCAS, StackExchange duplicate sets, any public Bulgarian intent-detection or Bulgarian FAQ dataset. A search for them returned only bgGLUE, Bulgarian SQuAD/RACE translations and a "Bulgarian search query intent classifier" Space, none of which I opened. I found **no ready-made Bulgarian FAQ/intent set**; the practical route is machine translation (below).

Redistribution:

- Banking77, MASSIVE, NLU-Evaluation-Data (CC BY 4.0), CLINC (CC-BY-3.0), NQ (CC-BY-SA-3.0): redistributable with attribution (NQ and Wikipedia sets: share-alike). A translated derivative of a CC-BY set may be redistributed with attribution; ShareAlike sets would force the same licence.
- COUGH (NC-SA), NLLB output (model is NC): **local testing only**, do not commit into the shipped repo. Quora, MS MARCO: licence unclear, local only.
- Recommended policy: nothing under `packages/*/eval/datasets/` is committed; a script downloads into a git-ignored cache. Only CC-BY derived generated KBs may be committed, with a NOTICE file.

### 1.3 Bulgarian

1. Translate subsets of Banking77 and CLINC (intents plus utterances) with opus-mt-en-bg (Apache 2.0). The card reports BLEU 50.6 / chrF 0.680, but I did not check on which test set, so treat translation quality as **UNVERIFIED** for chat-style queries. Translationese is likely (too formal, no slang); mitigate with a second LLM pass "rewrite as a Bulgarian speaker would type in a chat".
2. Latin-typed Bulgarian: either a deterministic transliteration table (the engine already handles it per ACTION-PLAN, so a mutator is exactly its inverse) or opus-mt's `bul_Latn` target token (stated on the card; quality **UNVERIFIED**). Prefer the deterministic table; it has no label noise.
3. Do not use NLLB for anything committed (NC licence).
4. WikipediaRetrievalMultilingual `bg` gives real Bulgarian text and LLM-made queries but the corpus is encyclopedic passages, not FAQ. Use only as a source of Bulgarian *neutral vocabulary* or as additional out-of-scope queries (a Bulgarian wikipedia-style question asked to a personal-site bot should fall back). Low priority.
5. Native Bulgarian site: the only high-quality Bulgarian test is a real Bulgarian site knowledge folder plus generation (section 3).

### 1.4 Ranked shortlist (benchmarking the engine itself)

| Rank | Dataset | Use | Command |
|---|---|---|---|
| 1 | CLINC150 plus | Only set with real out-of-scope: measures false answers (confident-wrong) and recall together. 150 intents, sample 75 | `curl -LO https://raw.githubusercontent.com/clinc/oos-eval/master/data/data_full.json` (path verified on the repo page; raw URL form not fetched) or `datasets.load_dataset("clinc/clinc_oos","plus")` |
| 2 | Banking77 | One fine-grained domain: a stress test for entries that overlap; tests `topic`/disambiguation behaviour | `git clone https://github.com/PolyAI-LDN/task-specific-datasets` then `banking_data/` (exact file names not verified). HF script loader is reported broken on the card; use the git files |
| 3 | MFAQ `en` | Real FAQ pages from real sites: gives realistic entries (question + answer text), the thing our product consumes. Pick domains with 30 to 100 Q/A pairs as sites. Needs an LLM to produce visitor-style queries, so it is a *KB source*, not a labelled set | `datasets.load_dataset("clips/mfaq","en")` (verified on card; 2 GB, stream it) |
| 4 | COUGH | Only human-paraphrased queries against a real FAQ bank, with multiple relevant items per query (so `topic` semantics). Local only (NC) | `git clone https://github.com/sunlab-osu/covid-faq`, files `data/FAQ_Bank_eval.csv`, `User_Query_Bank.csv`, `Annotated_Relevance_Set.csv` |
| 5 | NLU-Evaluation-Data (HWU64) | Second domain flavour (home, voice); CC BY 4.0 so a generated KB can be committed | `git clone https://github.com/xliuhw/NLU-Evaluation-Data` |
| 6 | MASSIVE `en-US` | Many short imperative utterances plus 18 scenarios: tests short keyword-like queries; no Bulgarian, so English only | `load_dataset("AmazonScience/massive","en-US")` (snippet from the card; the card's HF-script status was not checked) |
| 7 | Opus-mt translations of 1 and 2 | The only route to a Bulgarian engine benchmark | `pip install transformers sentencepiece`, model `Helsinki-NLP/opus-mt-en-bg`, prefix `>>bul<<` (token form from the card; check exact id) |
| 8 | GitHub Typo Corpus | Do **not** use as queries. Use only to sample realistic edit patterns for the typo mutator (English) | `https://github.com/mhagiwara/github-typo-corpus` |

Skipped: Quora, MS MARCO, NQ. They are open-domain or paraphrase-detection data, not intent-to-FAQ mapping, and Quora/MS MARCO licences are unclear. Reasonable later as a source of "question-ness" negatives, not for now.

Effort: items 1, 2, 5, 6 are about half a day each (converter script of about 60 lines: sample intents, write yaml, write json). MFAQ is one day because it needs the generator from section 3. Translation: a day including a sanity review of 100 translated rows.

## 2. Agent-generated evals: state of the art

| Tool / paper | What it does (verified) | Works with a plain list of FAQ entries? | Licence | Local model | Main weakness for us |
|---|---|---|---|---|---|
| Ragas TestsetGenerator | Builds a knowledge graph from documents (chunks, entities, keyphrases), then synthesizes queries; types single-hop specific/abstract, multi-hop specific/abstract (default 50/25/25); scenarios vary query length and style; personas listed as "coming soon" on the concept page. https://docs.ragas.io/en/stable/concepts/test_data_generation/rag/ , https://docs.ragas.io/en/stable/getstarted/rag_testset_generation/ | Needs documents to chunk; entries could be fed as documents, but multi-hop is meaningless for FAQ entries | Apache-2.0 (https://github.com/explodinggradients/ragas) | Docs list OpenAI, Bedrock, Google, Azure and LangChain wrappers; Ollama not mentioned (**UNVERIFIED**) | Python only, generator sees the passage so questions copy its wording; no out-of-scope, no typos |
| DeepEval Synthesizer | Pipeline input generation, filtration, evolution, styling; from docs, contexts, scratch or existing goldens; evolutions MULTICONTEXT, CONCRETIZING, CONSTRAINED, COMPARATIVE, REASONING, HYPOTHETICAL, IN_BREADTH; filtration threshold default 0.5. https://deepeval.com/docs/synthesizer-introduction | Yes via `generate_goldens_from_contexts` (each entry as a context) | Apache-2.0 (https://github.com/confident-ai/deepeval) | Docs state support for custom LLMs; Ollama specifics not in the excerpt (**UNVERIFIED**) | Evolutions make questions harder in reasoning terms, not more *visitor-like*; no engine-in-the-loop |
| Giskard RAGET | Six question types: simple, complex, distracting, situational, double, conversational; Ollama listed as supported provider; input a knowledge base DataFrame; output has question, reference context, reference answer, metadata with type and topic. https://legacy-docs.giskard.ai/en/stable/open_source/testset_generation/testset_generation/index.html | Yes, DataFrame of entries | Apache-2.0 | Yes (Ollama) | **No longer maintained in v3**, lives only in v2 (https://github.com/Giskard-AI/giskard-oss). Its taxonomy (situational, double, distracting) is the most reusable idea |
| LlamaIndex RagDatasetGenerator | `generate_dataset_from_nodes` creates question/answer pairs from nodes; API has changed over versions (search results only; docs page not opened) | Yes (nodes) | **UNVERIFIED** | **UNVERIFIED** | Plain question-from-passage; same leakage; not researched further |
| promptfoo `generate dataset` | Extends existing prompts/tests into new cases; options `--numPersonas`, `--numTestCasesPerPersona`, `--instructions`, `--provider`; YAML or CSV out. https://www.promptfoo.dev/docs/configuration/datasets/ | It generates inputs for a prompt, not retrieval labels | Not stated on that page | `--provider` selectable; default OpenAI | No labels (no expected entry), but its persona-times-cases structure is the pattern we copy |
| InPars | Few-shot LLM generates queries for documents to train rerankers. https://arxiv.org/abs/2202.05144 | n/a (method) | n/a | n/a | Built for training, not for evaluation; generated queries are paired with the source doc by construction |
| Promptagator | Task description plus at most 8 examples drive an LLM to generate queries; claims dual encoders beat ColBERT v2 by >1.2 nDCG on average. https://arxiv.org/abs/2209.11755 | method | n/a | n/a | Shows task-specific few-shot prompts work; also shows queries are tuned to the target distribution, so the few-shot examples define the bias |
| Persona Hub | 1 billion personas extracted from web data used as "carriers" to diversify synthetic data. https://arxiv.org/abs/2406.20094 | method | n/a | n/a | Supports persona-driven prompts as a diversity lever; their effect on retrieval *evals* is not shown by that abstract |
| CheckList | Behavioural-testing matrix of capabilities (negation, typos, vocabulary variations...) times test types, with a tool to generate many cases. https://arxiv.org/abs/2005.04118 | method | n/a | n/a | Source for the taxonomy; says held-out accuracy "often overestimates" generalisation, which is the exact flaw of our hand sets |

Known failure modes (cited):

- **Lexical-overlap bias**: neural question generators tend to produce questions with high word overlap with the source context (https://arxiv.org/pdf/2109.11256). For us that means generated questions reuse the entry's keywords, so the eval is easier than reality. This is the leakage problem; sections 3.4 and 3.6 counter it.
- **LLM-as-judge**: strong judges reach more than 80% agreement with humans, but show position, verbosity and self-enhancement bias (https://arxiv.org/abs/2306.05685). Use a different model for judging than for generating and shuffle candidate order.
- Label noise in generated questions (the question fits two entries) is not covered by any listed tool; none of them runs the questions through the real engine either. The verification loop in 3.6 is our differentiator.

Conclusion: do not adopt Ragas, DeepEval or Giskard as dependencies (Python, document-chunk oriented, no out-of-scope or clarify classes, retrieval labels single-source). Implement a small TypeScript generator inside the CLI that borrows RAGET's type names, promptfoo's persona structure and CheckList's perturbation list.

## 3. Design: `askstatic eval generate`

### 3.1 Command

```
askstatic eval generate --lang en [--knowledge src/askstatic] [--pages dist/]
    [--llm ollama:qwen3:8b | openai:... | anthropic:...] [--judge-llm <different model>]
    [--per-entry 24] [--seed 7] [--split dev|test] [--out src/askstatic/_eval/gen.<lang>.<split>.json]
    [--dry-run] [--max-usd 5]
```

- Inputs: knowledge folder (required), optional built site text (for site-specific out-of-scope near-misses and a "site brief"), existing eval files (for near-copy rejection). Optional `site.brief` in config: 3 lines describing the business; if absent, the LLM drafts it from entry titles (shown in the report for correction).
- Authoring-time only, never in `astro build`, never shipped; same rules as ONBOARDING-PLAN 1.7 (key via env, `--dry-run` prints the exact prompts and a token estimate, hash cache so unchanged entries cost nothing).
- Local model through the Ollama HTTP API with JSON-schema constrained output (`format` field, temperature 0 recommended for schema adherence; https://docs.ollama.com/capabilities/structured-outputs). Constraint: Ollama Cloud does not support it per the same page.

### 3.2 Question taxonomy (type id, expected class, how produced)

| type | expect | produced by |
|---|---|---|
| `para` natural paraphrase | answer | LLM, blind pass |
| `kw` 1 to 3 word keyword query ("pricing", "rates?") | topic | LLM + deterministic reduction |
| `situational` long message with context (RAGET "situational") | answer | LLM, persona pass |
| `slang` idioms for money/time/availability ("what's the damage", "got any room next month") | answer | LLM, persona pass |
| `typo` missing/doubled/swapped letters, keyboard neighbours | same as source | **deterministic mutator** on accepted questions |
| `order` wrong word order | same as source | deterministic (shuffle words) + LLM "non-native speaker" |
| `mixed` mixed language, Latin-typed Bulgarian | same as source | deterministic transliteration (bg to Latin) and LLM code-switch |
| `neg` negation ("I don't want to hire you, but...", "not for WooCommerce") | guarded | LLM, answer-aware pass |
| `num` numbers/versions ("PHP 5.6", "50,000 products", "3 weeks") | answer or guarded | LLM, answer-aware pass |
| `multi` two intents in one message | topic with 2+ ids | LLM from pairs of entries |
| `cmp` comparison ("X vs Y", "better than ...") | topic | LLM from pairs |
| `vague` underspecified, should clarify | clarify (only for entries with `clarification`) else topic | LLM |
| `oos` off-topic, related-but-not-covered, competitor, medical/legal | fallback | LLM + static list |
| `abuse` insults, spam, gibberish | fallback | static list + mutator |
| `inject` prompt-injection style ("ignore previous instructions...") | fallback | static list per language (about 20, maintained in repo) |
| `long` 300 to 1500 characters with one real question buried | answer | LLM padding wrapper |
| `empty` empty, whitespace, emoji only, punctuation only | fallback | static |

Deterministic types (`typo`, `order`, `mixed` transliteration, `abuse`, `inject`, `empty`, `long` padding with neutral text) need no LLM and carry no label noise. They are produced from questions that survived verification.

### 3.3 Personas and situations (diversity axis)

Fixed list of 14, cross-multiplied with entries; each LLM call receives one persona so output is not averaged:

1. Busy owner of a small shop, types fast on mobile, no punctuation
2. Non-native English speaker, simple vocabulary, odd word order
3. Angry customer with a problem right now
4. Skeptical buyer comparing three vendors, wants numbers
5. Technical lead, uses jargon and version numbers
6. Complete beginner, does not know the right term, describes the symptom
7. Recruiter or journalist, formal
8. Teenager or student, slang, abbreviations, emoji
9. Person in a hurry, 1 to 3 words only
10. Elderly or cautious user, long polite message with background
11. Returning visitor who read part of the site and asks a follow-up
12. Someone from a different country/timezone asking about availability and payment
13. Competitor or bot probing the site
14. Visitor who landed from a search engine and asks the question as they would type it into Google

Bulgarian runs use the same personas translated, plus: "types Bulgarian in Latin letters on a phone" and "mixes English tech terms into Bulgarian sentences".

### 3.4 Leakage control

1. **Blind pass (main pass, ~60% of questions)**: the generator sees only the *topic card* of the entry: `title` and a neutral one-line description of the subject written by the LLM from the answer in a separate step ("what is this page about, in 10 words, without using these keywords: ..."). It does **not** see `questions`, `keywords` or the answer. It is told to write what a visitor would type *before knowing the answer exists*.
2. **Forbidden-words constraint**: the entry's `keywords` and title words are passed as "avoid using these words verbatim in at least 2 of every 3 questions". Check afterwards with a stemmed-token overlap metric; reject questions above overlap 0.8 with the entry text (title, questions, keywords); report the mean overlap per type (the lexical-bias metric from https://arxiv.org/pdf/2109.11256 applied to ourselves).
3. **Answer-aware pass (~25%)**: allowed only for types that need facts (`num`, `neg`, `situational`, `cmp`); sees the answer.
4. **Confusion pass (~15%)**: for each entry, take its 2 nearest neighbours *by the engine's own scores*; generate a question that the entry answers but its neighbour does not. This yields hard, discriminative `answer` questions and exposes entries that overlap too much.
5. **Reject near-copies**: drop any question with trigram-Jaccard >= 0.7 (or normalised edit distance < 0.25) to any existing `questions`, title, or hand-written eval question.
6. **Generator and engine separation**: the generator never receives engine internals except the neighbour list in step 4, and never sees which questions the engine fails (see 3.7).

### 3.5 Prompt templates (paste-ready)

Placeholders in `{{ }}`. All calls use JSON-schema output `{"questions":[{"text":string,"type":string}]}`; temperature 0.9 for generation, 0 for judging.

**P0 site brief and topic card** (once per entry):

```
You are summarising one page of a website for a test designer.
Website description: {{site_brief}}
Entry title: {{title}}
Entry answer text: {{answer}}
Return JSON {"topic": "<max 12 words naming the SUBJECT of this page, no marketing words>",
"not_about": "<one thing a visitor might wrongly expect to find here, max 12 words>"}.
Do not copy phrases longer than two words from the answer.
```

**P1 blind visitor questions** (per entry x persona):

```
You write realistic messages that real visitors type into a small chat box on a website.
Website: {{site_brief}}
The visitor is: {{persona}}
The visitor wants to find out about this subject: "{{topic}}"
Write {{n}} different messages this visitor might type BEFORE they know whether the site has an answer.
Rules:
- Do not assume the site's wording. Describe the need in the visitor's own words.
- Do NOT use these words verbatim in more than a third of the messages: {{keywords_and_title_words}}.
- Vary length: some under 4 words, some one sentence, at most one longer.
- Match the persona's typing style (punctuation, slang, mistakes) but keep each message understandable.
- Language: {{lang_name}}. {{lang_rules}}
- Each message must be a different angle (price, time, who, how, whether, problem), not a rewording of another.
Return JSON {"questions":[{"text":"...","type":"para|kw|situational|slang"}]}.
```

**P2 answer-aware special types** (`num`, `neg`, `situational`, `cmp`):

```
Website: {{site_brief}}
Page title: {{title}}
Page answer (what the site says): {{answer}}
Persona: {{persona}}
Write {{n}} visitor messages of type "{{type}}" that this page is the best place to answer.
Definitions:
- neg: the message contains a negation or exclusion that changes the right answer (e.g. asks about something the page says it does NOT do, or "not X but Y").
- num: the message contains a number, quantity, date or version that the page's answer does not literally cover or covers only by range.
- situational: 2 to 4 sentences of personal context, then one real question.
- cmp: compares this page's subject with an alternative.
For neg and num also give "should_answer_confidently": false if the page text alone cannot safely answer it.
Do not quote the page. Language: {{lang_name}}.
Return JSON {"questions":[{"text":"...","type":"{{type}}","should_answer_confidently":true}]}.
```

**P3 confusion pass**:

```
Two pages on the same website:
A: {{title_a}} - {{topic_a}} - answer: {{answer_a}}
B: {{title_b}} - {{topic_b}} - answer: {{answer_b}}
Write {{n}} messages a visitor could type that page A answers and page B does NOT answer, but that share some vocabulary with B.
Then write {{n}} the other way around. Persona: {{persona}}. Language: {{lang_name}}.
Return JSON {"for_a":[...],"for_b":[...]}.
```

**P4 multi-intent** (random pairs of unrelated entries):

```
Pages: A "{{topic_a}}" and B "{{topic_b}}".
Write {{n}} single messages in which one visitor asks about both subjects at once, in a natural way (not "and also"). Persona: {{persona}}. Language: {{lang_name}}.
Return JSON {"questions":[{"text":"...","type":"multi"}]}.
```

**P5 vague**:

```
Page: "{{topic}}", which covers these sub-topics: {{children_titles}}.
Write {{n}} messages where the visitor clearly wants this general area but gives too little detail to know which sub-topic (for example "I need help", "how much", "can you do it"). Language: {{lang_name}}.
Return JSON {"questions":[{"text":"...","type":"vague"}]}.
```

**P6 out-of-scope near-misses** (once per site, not per entry):

```
Website: {{site_brief}}
Pages exist about: {{all_topics_comma_separated}}
Write {{n}} messages that a real visitor might type to this chat box which this website can NOT answer, in four groups: (1) clearly unrelated (weather, sport, recipes), (2) same industry but a service or fact the site does not cover, (3) personal/private data requests about the owner, (4) requests for help with the visitor's own technical problem that needs a human.
Do not write anything that is actually covered by the pages above. Language: {{lang_name}}.
Return JSON {"questions":[{"text":"...","type":"oos","group":1}]}.
```

**P7 judge** (different model if possible; candidate order shuffled with seed):

```
A visitor typed: "{{question}}"
Here are {{k}} candidate pages from a website (id, title, answer):
{{candidates}}
For each page decide whether it directly answers the visitor's question: "yes", "partly" (right subject, missing the specific detail), or "no".
Also decide: is the visitor's message answerable from the pages at all? ("answerable": true/false)
Return JSON {"pages":{"<id>":"yes|partly|no"},"answerable":true,"reason":"<max 15 words>"}.
```

Candidates = the intended entry + the engine's top 3 + 2 random entries, all shuffled.

**P8 colloquial rewrite for translated or stiff questions** (Bulgarian especially):

```
Rewrite this message as a real person would type it in a chat on their phone, in {{lang_name}}, keeping the meaning exactly. Keep numbers, names and technical terms unchanged. Persona: {{persona}}. Return JSON {"text":"..."}.
Message: "{{question}}"
```

### 3.6 Verification loop (no human needed)

Order matters: the engine is **not** used as a filter for correctness, because dropping every question the engine fails would make the eval look better than the engine is.

1. **Schema and sanity**: non-empty, length 1 to 2000, language detected as target (cheap heuristic: Cyrillic ratio for bg), no placeholder text, no meta-talk ("As a visitor...").
2. **Dedup**: within the generated set, drop pairs above trigram-Jaccard 0.8 or embedding cosine > 0.92 if an embedding model is available (Ollama embeddings); keep per-type quotas. Embeddings optional; trigram works with no model.
3. **Near-copy rejection** against existing questions (3.4 item 5).
4. **Judge** (P7). Decision table for a question generated for entry X:
   - judge says X yes and no other yes: label `answer` (or the type's native expect), `id: X`, `conf: high`.
   - X yes plus another yes: `expect: topic`, `id: [X, Y...]` (the label becomes the set of valid entries; this implements the "match 2+ entries" check).
   - X partly: keep as `topic`, `conf: low`.
   - X no, another page yes: relabel to that page, `conf: low`, mark `relabelled`.
   - answerable=false: relabel `fallback` if type is `oos`, else drop and count.
   - Different judge model than generator; random candidate order; run the judge twice with different order, keep only if both agree, otherwise `conf: low` (position-bias mitigation, https://arxiv.org/abs/2306.05685).
5. **Round-trip with the real engine (diagnostic only)**: run each question through `respond()`. Classify result against the judged label. Disagreements engine vs judge are the *interesting* rows: either an engine defect or a label error. They are sorted into the report, never silently removed. Questions where engine and judge agree and X is the only match are `conf: high`.
6. **Deterministic mutators** run on `conf: high` and `conf: low` alike, inheriting the label; mutated `expect` for `neg`/`num` stays `guarded`.
7. **Report** `_eval/gen-report.md`: counts per type, judge agreement rate, mean lexical overlap per type, the 30 lowest-confidence labels with the judge's reason, the engine-vs-judge disagreements, entries with fewer than 5 surviving questions, and entries judged ambiguous with each other (feeds the existing gap and overlap checks). Optional human spot check = reading that report; the pipeline does not wait for it.
8. **Calibration without humans**: report the judge's agreement on the *existing hand-written* sets (`en.json`, `en.heldout.json`): ask the judge to label those 168 known-good questions and report how many it confirms. That number is the judge's measured noise level. If the judge confirms less than 90% of the hand labels, warn that generated labels are weak.

### 3.7 Held-out discipline

- Two splits generated with different seeds, different persona subsets, and where possible a different generator model: `dev` (used when tuning synonyms, thresholds, stopwords) and `test` (frozen).
- `test` file written to `_eval/frozen/<lang>.test.json` with a sidecar `.lock` containing `sha256(file)` and the knowledge hash. The CLI refuses to regenerate it without `--rotate`, which writes a new versioned file and keeps the old one.
- `askstatic eval --frozen` prints only aggregates by type (no failing question text) so the failures cannot be used for tuning; to read failures the user passes `--reveal`, which marks that test version as *burned* in the lock file and requires `--rotate` before the next claim.
- A CI step compares `test` scores between commits; a rise above a threshold without a dev rise is reported as "possible overfitting" (informational).
- The hand-written `en.json` / `en.heldout.json` stay as a third, separately reported set (`source: human`), because they are the only labels with a human behind them. The heldout file is already burned if its failures were used to tune.

### 3.8 Output format

Backward compatible; the current runner ignores the extra fields. Minimal additions per row:

```json
{
  "q": "whats the damage for a one-off speed fix",
  "expect": "answer",
  "id": ["pricing", "performance-audit"],
  "type": "slang",
  "lang": "en",
  "persona": "busy-owner-mobile",
  "source": "gen:v1:p1:qwen3-8b",
  "split": "dev",
  "conf": "high",
  "from": "performance-audit"
}
```

- `type`: taxonomy id (3.2). `lang`. `persona`. `source`: `human`, `gen:<version>:<pass>:<model>`, `mut:<mutator>`, `dataset:<name>`. `split`: `dev|test`. `conf`: `high|low`. `from`: entry the question was generated for (differs from `id` when relabelled).
- File naming: `_eval/gen.<lang>.dev.json`, `_eval/frozen/<lang>.test.json`, report `_eval/gen-report.md`.
- Runner changes needed (small): group results by `type` and `source`; print the table of section 4.4; accept `--set dev|test|human|all`; keep the existing exit rule.

### 3.9 Counts, cost and runtime for a 75-entry site (my estimates)

Per entry, 24 target questions: 8 blind (`para`/`kw`/`slang`/`situational`, across 4 personas), 3 answer-aware (`num`/`neg`), 3 confusion, 2 vague-or-cmp where applicable, plus deterministic mutants of about 8 surviving questions (typo 3, order 2, mixed/latin 2, long 1). Site level: about 60 `oos`, about 40 `multi`, static `abuse`/`inject`/`empty` about 40.

- LLM output questions: 75 x ~18 generated + ~100 site-level, about 1,450 questions after over-generating by 1.5x for rejects, so about 2,200 generated. At ~20 tokens per question including JSON, about 45k output tokens; prompts add about 150k input tokens (entry answers are included only in some passes). Judge: ~1,500 calls x ~800 input tokens, twice, about 2.4M input tokens, 30k output.
- Expected survivors: about 1,100 verified plus ~600 mutants, i.e. about 1,700 rows, in dev and test about 50/50 (two separate runs).
- **Local 8B model** (Ollama): roughly 1 to 1.5 hours per full run on Apple Silicon at an assumed 20 to 40 tokens/s generation; judging prompt-processing dominates; I did not benchmark. Cost zero. Quality risk: 8B models drift on Bulgarian and on `neg` labels; treat Bulgarian generation by 8B models as **UNVERIFIED** and check the judge calibration number (3.6 item 8) before trusting it.
- **API model**: tokens as above (about 2.7M in, 80k out per run, about 5.4M in for dev plus test). Cost = tokens times the owner's current price; I did not look up prices. `--max-usd` guard and `--dry-run` estimate are mandatory. Runtime about 10 to 20 minutes with 8 parallel requests.

## 4. Pilot plan for gkanev.com (75 entries)

The knowledge folder has 91 yaml files; about 75 are non-`post-*` and non-`data-*` entries, but the count to use must come from `loadKnowledge` (not verified here).

### 4.1 Steps

1. Freeze engine commit. Record current scores of `en.json` and `en.heldout.json` with `node packages/astro/eval/run-site.ts <dir> <file>` as baseline `human`.
2. Add `type`, `source` etc. fields and the per-type breakdown to `run-site.ts` (about 40 lines). Add `--set`.
3. Implement `eval generate` as a script first (`packages/astro/eval/generate.ts`) before it becomes a CLI command; Ollama adapter plus an OpenAI-compatible adapter (many servers speak it; claim **UNVERIFIED** for each provider).
4. Run generation with a local 8B model, `--split dev`, seed 1. Read `gen-report.md` for 20 minutes (the only human step, optional).
5. Run the judge calibration on the 168 human rows. Gate: confirmation >= 90%, otherwise switch judge model.
6. Run the engine on `dev`; fix the engine or knowledge (synonyms, keywords) using dev failures only.
7. Generate `test` with seed 2 and a different persona subset (and the API model if the owner supplies a key); lock it. Run once. Report.
8. Repeat the exercise for Bulgarian using the Bulgarian knowledge folder if one exists for gkanev.com (not checked) otherwise the demo BG pack.
9. Run the isolated engine benchmarks (4.3).

### 4.2 Expected numbers

- dev about 1,700 rows, test about 1,700 rows (compare: 168 hand-written). Per type 40 to 250 rows; `empty`, `inject`, `abuse` are small and deterministic.
- Entries with fewer than 5 surviving questions listed explicitly (candidates for knowledge fixes).

### 4.3 Engine in isolation

Use, in order: CLINC150 plus (75-intent sample, 3 seeds, in-scope test plus the 1,000 OOS test queries as `fallback`), Banking77 (75 of 77 intents as one site, `answer` and lenient `topic` metrics), NLU-Evaluation-Data (CC BY 4.0, committable generated KB), MFAQ (3 English domains with 30 to 100 FAQ pairs as sites, queries generated with P1 from the *question only*, answer-hidden), COUGH local only if time permits, plus the opus-mt Bulgarian translation of the CLINC and Banking77 samples (100 translated rows read for sanity). Baseline question: how does the engine compare with the same synthetic KB under a plain BM25/MiniSearch-only configuration, to measure what the synonyms/stemmer/coverage logic adds? (Needs a config switch; check whether one exists.)

### 4.4 Reporting by type

Table per run (and per language):

| type | n | correct % | confident-wrong | missed | disambiguated | mean lexical overlap |
|---|---|---|---|---|---|---|

with a second table by `source` (human, gen, mut, dataset) and by `conf`. Headline numbers: (a) overall `answer`-type precision on `conf: high` rows, (b) confident-wrong count by type (should be zero for `oos`, `abuse`, `inject`, `empty`), (c) delta between blind and answer-aware passes (leakage indicator: a large gap means blind questions are the honest estimate), (d) delta human vs generated (how optimistic the hand set was).

## 5. Risks and open questions (recommended default in brackets)

1. **Judge and generator share blind spots, so labels can be wrong in correlated ways.** [Different models for generating and judging, double judge with swapped order, calibration against the human set, report disagreements instead of dropping them.]
2. **Filtering by engine success inflates scores.** [Never filter on the engine; use it only for diagnostics.]
3. **Generated questions still sound like LLMs** (polite, complete sentences, no real mess). [Persona list, deterministic mutators, and keep a small real-query set from the feedback loop (ACTION-PLAN to-do 1) as the only ground truth; report `source` splits separately.]
4. **Synthetic score is not a quality claim for the product.** [Docs wording: "generated eval estimates regressions, not visitor satisfaction"; show human and generated numbers side by side.]
5. **Bulgarian quality of local 8B models and of opus-mt translations is unmeasured.** [Ship Bulgarian generation behind a warning until calibration passes; prefer API model for Bulgarian.]
6. **Dataset licences.** COUGH is NC-SA, NLLB is NC, Quora and MS MARCO unclear. [Download to a git-ignored cache, never commit; commit only CC-BY derived samples with attribution.]
7. **`clarify` expectations need entries with `clarification`.** [Generate `vague` only for those; otherwise expect `topic`.]
8. **Neg/num labels (`guarded`) are the most error-prone** since "should not answer confidently" is a product decision. [Use `guarded` only when the answer-aware pass flags `should_answer_confidently: false` and the judge agrees; otherwise drop.]
9. **Frozen test split vs tool changes**: any change to normalisation or tokenizer can change comparability. [Lock stores engine version; rotate the test set on major matching changes.]
10. **Privacy**: sending knowledge text to an API. [Local model by default; API only with explicit `--llm` plus `--dry-run` preview, consistent with ONBOARDING-PLAN 1.7.]
11. **Runner exit rule** `confidentWrong > 1` is too lenient for a 1,700-row set. [Gate on rate (for example 0 on `oos/abuse/inject/empty`, <= 0.5% elsewhere) in `--ci`.]
12. **Owner question: should generated sets be committed to the repo?** [Yes for dev (diffable, small); test goes to `_eval/frozen/`, also committed, since lock file already protects it.]
13. **Owner question: Python tooling allowed?** [No. TypeScript generator in the CLI; Python only for one-off dataset conversion scripts under `scripts/`.]
14. **Not verified in this research**: LlamaIndex current API and licence, Ollama support in Ragas/DeepEval, bgGLUE contents and licences, ORCAS, StackExchange duplicates, any Bulgarian FAQ dataset, model prices, Apple-Silicon throughput numbers, the Banking77 raw file names in the GitHub repo.
