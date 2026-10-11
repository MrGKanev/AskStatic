# Brief: label which pages of a website answer a visitor's chat question

You are the judge for an evaluation set. A personal/business website has a chat box that answers from a fixed catalog of pages ("entries"). A visitor typed each message below. For each message decide which catalog entries would genuinely help answer it.

Files:
- Catalog: <catalog.json: id, title, gist per entry>  (each item: id, title, gist = the first sentence of the entry's answer, kind)
- Your messages: the judge-in-N.json file named in your task (items: n, q)

Do NOT open any other file in the repository or the website folders; use only the catalog and your messages. You do not know which entry the message was written for; decide only from the message and the catalog.

For each message output ONE JSON line:
{"n": <number>, "answers": ["id", ...], "ok_to_answer": true|false, "reason": "<max 12 words>"}
- "answers": the ids of entries that directly answer the message, best first, at most 3. If the message asks two things, list entries for both. Use [] when NO entry in the catalog can answer it (off-topic, or the site simply does not cover it).
- "ok_to_answer": true when a good assistant could reply with a single entry right away; false when the message is too vague, depends on a negation or on facts the entries do not state, or really needs a clarifying question or a choice between entries.
- Be strict: an entry that only shares a word with the message does not answer it. Be fair: if two entries both genuinely answer, list both.

Write the lines to the output file named in your task using the Write tool (one file, all lines, no commentary, no markdown fences). Reply with one line: how many messages you labelled.
