# Brief: write realistic visitor questions for a personal/business website's chat box

The site belongs to Gabriel "Gabo" Kanev: a WordPress/WooCommerce consultant, product strategist and researcher from Ruse, Bulgaria (consulting, audits, performance, speaking, open-source plugins, a blog, a PhD in analysing user feedback, a homelab). Visitors are potential clients, recruiters, peers, students, readers of the blog, and people who ended up here by accident.

You get a list of TOPICS (id, title, a one-sentence gist). For each topic write questions that a real visitor might type into the chat box BEFORE they know what the site says about it. You are simulating visitors, not paraphrasing the topic text.

## Hard rules
- Do not copy phrases from the gist; a visitor has not read it. Use the words real people use (including wrong or loose ones).
- Do NOT open, read or search any other file in the repository or the website folders. Use only the batch file and this brief. (Reason: this is a test set and must not be written with knowledge of the answers or of existing example questions.)
- Each question must be something that the given topic would really help answer. If you cannot imagine a real visitor asking it, skip it.
- Vary form a lot: lowercase and no punctuation, full polite sentences, fragments, one-word queries, long messages with context, typos, text-speak, run-ons, questions with a greeting, non-native English.
- 10 to 14 questions per topic, covering at least 8 different TYPES from the list below, with several questions of the harder types.

## Types (use these exact labels in the output)
- natural: a normal, complete question in everyday words
- short: 1-3 words, keyword style ("pricing", "cv", "hire woocommerce dev")
- long: a long situational message (25-60 words) that describes the visitor's problem and then asks
- slang: idioms, slang or indirect phrasing (money: "what's the damage", "ballpark?"; time/availability: "got any room next month", "can we hop on a call")
- typo: realistic typos, dropped or swapped letters, missing spaces, wrong homophones
- wordorder: unusual word order or broken grammar as a non-native speaker might write it
- negation: the question contains a negation or a "do you NOT ..." phrasing about the topic
- numbers: includes a specific number, quantity, version or date ("40k products", "since 2019", "php 8.3")
- multi: two intents in one message, one of them about this topic
- compare: compares options or asks for a recommendation between choices related to the topic
- vague: underspecified, a visitor who does not know what to ask ("I need help with my site", "tell me more")
- polite: greeting plus a very courteous request ("Hi Gabo, hope you're well, I wanted to ask ...")

## Personas (rotate; label each question with one)
potential_client_small_shop, agency_owner, cto_enterprise, recruiter, student, phd_researcher, blog_reader, journalist, fellow_developer, hobbyist_homelabber, non_native_speaker, impatient_mobile_user, skeptic, someone_who_landed_here_by_mistake

## Output
Write ONE JSON object per line (JSON Lines), no commentary, no markdown fences, to the output file named in your task:
{"id":"<topic id>","type":"<type label>","persona":"<persona>","q":"<the visitor's message>"}
