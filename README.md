# Remembering Thamus

Ask a research compliance question five ways, one at a time: from the model's memory, from text you paste, from a web search, from the regulation itself, read live over MCP, and from a vector database of 2 CFR 200. The same model answers every time. Only what it is handed differs. Thamus warned that writing would ruin memory. He is remembered only because Plato wrote him down.

**Live:** [nate-layman.github.io/thamus](https://nate-layman.github.io/thamus/)

Part of the [AI4RA](https://ai4ra.uidaho.edu) workshops at the University of Idaho. Built for the NCURA Region VI/VII 2026 session [Augmenting Research Administration with AI](https://ui-insight.github.io/NCURARegionalWorkshop2026/).

## The story

In Plato's *Phaedrus*, Socrates tells a story about an Egyptian god named Theuth, the inventor of number, geometry, astronomy, and letters. Theuth brings his inventions to Thamus, the king, and argues for each one. When he comes to writing he makes his strongest claim:

> This will make the Egyptians wiser and give them better memories; it is a specific both for the memory and for the wit.

Thamus is not persuaded. The inventor of a thing, he says, is not the best judge of what it will do to the people who use it. Then he delivers the verdict that has followed writing ever since:

> This discovery of yours will create forgetfulness in the learners' souls, because they will not use their memories; they will trust to the external written characters and not remember of themselves. The specific which you have discovered is an aid not to memory, but to reminiscence, and you give your disciples not truth, but only the semblance of truth; they will be hearers of many things and will have learned nothing; they will appear to be omniscient and will generally know nothing; they will be tiresome company, having the show of wisdom without the reality.

Plato, *Phaedrus* 274c to 275b, in Benjamin Jowett's translation.

Notice the distinction Thamus draws. Writing is a remedy not for memory but for reminding. The marks on the page do not put knowledge in you. They only remind you of what you would otherwise have to carry yourself. He meant that as the flaw.

## The paradox

Thamus warned that writing would ruin memory. He is remembered only because Plato wrote him down.

Socrates, who tells the story, wrote nothing. Everything we have of him comes from the pens of his students. So the dialogue does to Socrates what Plato does to Thamus: a warning against the written record, preserved for twenty-four centuries by nothing but the written record. The argument survives by the means it argues against.

That is worth sitting with, because the same tension runs through every tool that lets us reach for stored information instead of holding it ourselves. It ran through writing, then libraries, then search engines, and now it runs through language models. The costs Thamus named are real. So are the benefits he dismissed. The question is never whether to reach for the record. It is who should reach for it, when, and what they must still carry in their own head to judge what comes back.

## What Thamus got right about people

Thamus was describing a person who has access to the record and has stopped learning. That person is real, and research administration has met them.

- **The appearance of knowledge.** Someone who can find the regulation is not the same as someone who understands it. An administrator who has never learned the de minimis rule cannot tell a correct answer from a plausible one, whether it comes from a colleague, a search result, or a model. The record gives you a sentence. Judgment is what tells you whether the sentence is right.
- **The skill that fades.** What you never hold, you never practice. Psychologists have measured this with search engines: people remember where to find a fact more readily than the fact itself (Sparrow, Liu and Wegner, *Science*, 2011). A profession that delegates all of its remembering keeps the appearance of expertise and loses the substance.
- **The dependence.** A person who can only answer with the record open is helpless when the record is unavailable, wrong, or out of date, and cannot tell which of those has happened.

This is the human half of the workshop, and it is the half the tools cannot fix. It is why a research administrator using AI still has to know the rules well enough to catch the model when it is wrong.

## What counts as AI

Before asking what a model remembers, it helps to see how the people who regulate, fund, and govern this work define the thing itself. Three definitions, from three levels of authority:

| Level | Source | Definition |
|---|---|---|
| **Law** | 15 U.S.C. § 9401(3), the National Artificial Intelligence Initiative Act of 2020 | "A machine-based system that can, for a given set of human-defined objectives, make predictions, recommendations or decisions influencing real or virtual environments. Artificial intelligence systems use machine and human-based inputs to (A) perceive real and virtual environments; (B) abstract such perceptions into models through analysis in an automated manner; and (C) use model inference to formulate options for information or action." |
| **Sponsor** | National Institutes of Health, *Strategic Plan for Data Science 2025 to 2030* | "The power of a machine to copy intelligent human behavior." |
| **Institution** | University of Utah, *Artificial Intelligence Use Guidelines*, September 2026 | "A machine-based system designed to perform tasks that typically require human intelligence, including but not limited to generating content, making predictions, analyzing data, or executing actions." |

Read them together and one thing stands out. Each defines AI by what it does: predict, decide, generate, analyze, copy intelligent behavior. None of them says where the system's knowledge comes from, or whether it is remembering or looking something up. The law comes closest, with its "machine and human-based inputs," but it does not ask which inputs were read years ago and which were read this morning.

That is the question Thamus asked about people, and it is the question these definitions leave open about machines. A system that "makes predictions" from a frozen memory and a system that makes them after reading the current rule both satisfy every definition in the table. Only one of them can tell you the de minimis rate today. The rest of this page is about that difference.

## What Thamus got wrong, and what it means for a machine

Thamus assumed that memory was the reliable thing and the record was the threat. For people that is at least arguable. For a language model it is backwards.

A model's memory is its training: an enormous, averaged, frozen impression of everything it read, up to a date after which it read nothing. That memory is confident, fluent, and stale. Ask it for the de minimis indirect cost rate and it will tell you ten percent, because that was the rule in most of what it read, and it will not tell you that the rule changed to fifteen percent on October 1, 2024. It is Thamus's learner exactly: a hearer of many things, appearing omniscient, generally knowing nothing about today.

The remedy is the one Thamus refused. Give the model the written record and let it be reminded. There are many ways to do that. The page walks through five of them, chosen from a dropdown, with the same model and the same question each time:

| | Way | What the model is handed | Biggest benefit | Biggest cost |
|---|---|---|---|---|
| 1 | **No context** | The question alone. The model answers from memory. | Instant and free. No infrastructure, no source to keep ready. | Frozen on a date, and it cannot tell you so. |
| 2 | **Pasted context** | Whatever you put in the text box, and nothing else. You did the reading. | You know exactly what it read. | You have to find the right text, and the right version, yourself. |
| 3 | **Web search** | The question goes to a search engine as typed. The model gets eight titles, addresses and snippets, and reads no page in full. | Reaches anything public, including what changed last week. | Anyone's page, any year. The model referees sources it cannot judge. |
| 4 | **API call** | The model turns the question into search words, a Model Context Protocol server searches the eCFR, and the model reads the one paragraph that bears on the question, with a pinpoint citation such as 2 CFR 200.414(f). | Current, cited and checkable to the paragraph. The answer changes when the regulation changes, not when the model does. | Slowest and most fragile: several calls, each of which can fail or read the wrong paragraph. |
| 5 | **Vector database** | 2 CFR 200 cut into 1,103 passages and embedded. The backend embeds the question with the same model, the browser ranks every passage by cosine similarity, and hands over the nearest four. This is what most products call retrieval-augmented generation. | Fast and cheap: the whole corpus searched by meaning, the ranking done in your browser. | Only as current as the day the index was built, and a near miss looks like a hit. |

For a machine, Thamus's flaw is the feature. A model that is reminded is a model that can be checked. Under every answer the page shows exactly what the model was handed: the system prompt, the pasted text, the search results, the trail of eCFR calls and the paragraph that came back, or the passages and their scores.

### Ways not on the page

- **Structured data over SQL.** When the record is a table rather than prose, the model should write the query and let a database compute the answer. [Data Crawler Carl](https://ui-insight.github.io/data-crawler-carl/) does that for any CSV, in the browser, and is the sixth way in the workshop.
- **Files in reach of a local agent.** Tools that run on your own machine, such as Claude Code, Cursor or Copilot, let you name a file with `@path/to/file` and the agent reads it into context. Same idea as the paste box, with the reading done for you, and the same obligation: you still have to know whether that file is the governing one.
- **Long context.** Paste the whole of 2 CFR 200 and ask. It fits in some models' windows now, at a cost in time and money per question, and the model still has to find the paragraph.

## Benefits and costs of reaching for the record

| | Benefits | Costs |
|---|---|---|
| **For people** | The record outlasts memory and outlasts us. It can be checked, cited, shared, and corrected. No one should memorize the Code of Federal Regulations, and the rule you memorized in 2023 is wrong today. | What you never learn you cannot judge. Skills you do not use fade. A person who can only answer with the record open cannot tell when the record has failed them. |
| **For a model** | Answers are current, cited, and checkable. The source can be versioned and shipped with the output. A wrong answer can be traced to a wrong passage rather than to a black box. | Every trip to the record costs time, infrastructure, and a source that has to be right and ready. The trip can fail, the passage can be the wrong one, and the model can still misread what it is handed. The context window is a page limit. |

The two columns of that table are the two directions of the workshop. People need to keep enough in their own heads to judge what the record says. Models need to stop trusting what they remember and read the record every time. Neither direction is optional, and each one makes the other safe.

## What to watch for on the page

Ask the same question each way and look for five things.

- **Confidence does not change.** The model sounds equally sure from memory and from the record. Confidence is not evidence.
- **The paste is only as good as the paster.** The text box has two fill links: the paragraph of 2 CFR 200.414 as it stands today, and as it stood in 2023. Hand the model the 2023 text and it will answer from the 2023 text, politely and wrongly. The person who did the reading is the one who has to know which version they read.
- **Search is wide and shallow.** Snippets come from anyone, in any year, and the model is left to referee. Often it lands on the right figure. Open the trail and see what it had to wade through.
- **The regulation, read live, shows its work.** The search words, the section it read, and the paragraph it answered from are all visible. That trail is what an auditor would ask for, and it is what memory can never provide.
- **The index is close.** Retrieval over a vector index often lands near the right passage without landing on it, and the answer is a blend of what it found and what it remembered. The similarity scores are right there.

Good questions to try are the ones whose answers changed in the 2024 revision of the Uniform Guidance: the de minimis rate, the equipment capitalization threshold, and the amount of each subaward that counts toward modified total direct costs. In the workshop, poll the room for a compliance question, enter it once, and step through the ways with Next.

## To end on

Which do you trust more: someone who remembers everything, or someone who knows where everything is written?

Thamus would say the first. The page is five arguments, and none of them settles it. In the workshop the frame is a quiz show: the research administrator is the contestant, the model from memory is the audience, and the other four ways are the audience provided with tools. Whichever lifeline is used, the contestant is the one who says final answer. The page has a box for the room's own answer, filled before any lifeline runs and shown beside each answer afterwards. Before giving a final answer, decide what a person has to carry in their own head to tell whether what came back is right. What did the person have to already know to catch the memory answer when it was wrong? What did they have to know to paste the right text, and the right version of it? When the regulation was read out with its citation, who in the room could check it?

## Running it

The page is static and runs in the browser, like [Data Crawler Carl](https://github.com/ui-insight/data-crawler-carl) and [Promptulus](https://github.com/AI4RA/promptulus), whose shell it borrows. GitHub Pages serves `docs/` from `main` through `.github/workflows/pages.yml`.

**The key.** The ways that ask a model need one. A University of Idaho MindRouter key (prefix `mr2_`) routes the model calls through the AI4RA lakehouse proxy to the University's own models. Any other key is treated as a Google Gemini key and goes to Google. The key is held in sessionStorage, scoped to the tab, cleared when it closes, and never stored in this site's source. Facilitators pre-fill it by sharing a link with `?key=YOUR_KEY` appended, which the page reads once and strips from the address bar. Reading the regulation and the web search need no key of their own: they go to the hosted [ai4ra-mcp](https://github.com/ui-insight/ai4ra-mcp) server, which allows any origin and logs no keys. The vector database uses the same key as the model: the backend that answers also embeds the question.

**On a laptop:**

```bash
python3 scripts/serve.py
```

Then open http://localhost:4173 and paste a key, or pass it once as `?key=...`. The script serves `docs/` and proxies `/v1/*` to MindRouter, because the public proxy allows only the published origins; a plain static server works for everything except the model calls.

**The proxy's allowlist.** Browser calls to the lakehouse proxy succeed only from origins its Caddy config names. If the live page says "Could not reach MindRouter (Load failed)", the origin is missing from the host's Caddy config. The allowlist is the three Pages origins the AI4RA apps live on: ai4ra.github.io, ui-insight.github.io and nate-layman.github.io. Host configuration is kept out of this repository (`deploy/` is ignored).

**The vector database** is built, not hand-written. `scripts/fetch_corpus.py` fetches the current 2 CFR 200 from the eCFR and cuts it into passages, one per lettered paragraph or defined term, each with its pinpoint citation and a link; `scripts/embed_corpus.mjs` has each backend embed them with its own model and writes `docs/index/`: Qwen3-Embedding-8B on MindRouter (cut to 1,024 dimensions) and gemini-embedding-2 on Gemini (768). The page asks the backend that holds the key to embed the question with the same model and compares it with that backend's vectors, so no model is downloaded to the browser. Both sides read `docs/js/embeddings.js`, so the model, the size and the text around each passage and question cannot drift apart. To rebuild after the regulation changes:

```bash
cd scripts && MINDROUTER_API_KEY=mr2_... GEMINI_API_KEY=... npm run build
```

With one key set, only that backend's vectors are rebuilt; `node embed_corpus.mjs gemini` rebuilds one by name.

Commit the result. The page shows the date of the eCFR text the index was built from, which is the point: this way is as current as its last build.

No sponsored project data, PII, or restricted information should be entered; the only thing the page is built to read is public regulation.

## Sources

- Plato, *Phaedrus* 274c to 275b. Translated by Benjamin Jowett, 1892. Public domain.
- Jacques Derrida, "Plato's Pharmacy," in *Dissemination*, 1981. The essay that noticed the paradox first.
- Betsy Sparrow, Jenny Liu and Daniel M. Wegner, "Google Effects on Memory: Cognitive Consequences of Having Information at Our Fingertips," *Science* 333 (2011): 776 to 778.
- Vannevar Bush, "As We May Think," *The Atlantic*, July 1945. The memex, the original argument for reminding machines as an aid to human memory rather than a replacement for it.
- 2 CFR Part 200, Uniform Administrative Requirements, Cost Principles, and Audit Requirements for Federal Awards, as revised effective October 1, 2024, read from the eCFR at https://www.ecfr.gov.
- Nils Reimers and Iryna Gurevych, "Sentence-BERT: Sentence Embeddings using Siamese BERT-Networks," *EMNLP* 2019. The idea behind the vector database: a sentence as a point, and nearness as meaning.

## Authors and license

Nathan Layman and Bert Baumgaertner, University of Idaho. The code is licensed under the [Apache License 2.0](LICENSE) and the text under [CC BY 4.0](LICENSE-CONTENT.md), the same terms as the workshop it belongs to. [NOTICE](NOTICE) carries the attributions and the third-party credits: the Google Gen AI SDK (Apache-2.0, loaded only with a Gemini key), and the AI4RA MCP server. To cite the project, use [CITATION.cff](CITATION.cff).

Remembering Thamus is a project of [AI4RA](https://github.com/AI4RA) at the University of Idaho. This material is based upon work supported by the National Science Foundation under the GRANTED program, [NSF Award #2427549](https://www.nsf.gov/awardsearch/show-award?AWD_ID=2427549), "Crossing the Innovation Valley of Death: Democratizing Data and Artificial Intelligence for Research Administration." Any opinions, findings, conclusions or recommendations expressed in this material are those of the authors and do not necessarily reflect the views of the National Science Foundation.
