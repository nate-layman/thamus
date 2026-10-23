// Remembering Thamus: one question, five ways of answering it, one at a time.
// Every way asks the same model at temperature 0. Only what it is handed differs:
// nothing, a passage you pasted, search-engine snippets, the nearest passages from a
// vector index of 2 CFR 200, or the one eCFR paragraph a live lookup read.
import { getKey, setKey, readKeyFromURL, wasKeyLoadedFromURL } from './key-manager.js';
import { initAPI, hasAPIKey, callModel, backendName, listModels, setModel, currentModel, isMindRouterKey } from './api.js';
import { webSearch, formatResults } from './web-search.js';
import { retrieve, loadModel, indexInfo, formatPassages } from './vector-index.js';
import * as ecfr from './ecfr-lookup.js';
import { callMCPTool } from './mcp.js';

const $ = id => document.getElementById(id);

const PRESETS = [
  'What de minimis indirect cost rate may a recipient without a negotiated rate charge?',
  'What is the per-unit acquisition cost threshold for equipment?',
  'How much of each subaward counts toward modified total direct costs?',
  'Are alcoholic beverages an allowable cost?'
];

const ANSWER_RULES = 'Keep the answer to one or two sentences. State the figure or rule, then name the citation.';

const WAYS = [
  {
    id: 'memory',
    title: 'No context',
    sub: 'The model answers from memory: its training and nothing else.',
    benefit: 'Instant and free. No infrastructure, no source to keep ready.',
    cost: 'Frozen on a date, and it cannot tell you so.',
    watch: 'Listen to the confidence. It will sound exactly as sure here as it does with the regulation in hand. Confidence is not evidence.',
    run: runMemory
  },
  {
    id: 'paste',
    title: 'Pasted context',
    sub: 'You find the passage and hand it over.',
    benefit: 'You know exactly what it read.',
    cost: 'You have to find the right text, and the right version, yourself.',
    watch: 'Hand it the 2023 text and it will answer from the 2023 text, politely and wrongly. The person who did the reading is the one who has to know which version they read.',
    run: runPaste
  },
  {
    id: 'web',
    title: 'Web search',
    sub: 'The question goes to a search engine as typed. The model gets the snippets.',
    benefit: 'Reaches anything public, including what changed last week.',
    cost: 'Anyone\u2019s page, any year. The model referees sources it cannot judge.',
    watch: 'Wide and shallow. Snippets come from anyone, in any year. It often lands on the right figure; look at what it had to wade through to get there.',
    run: runWeb
  },
  {
    id: 'ecfr',
    title: 'eCFR lookup',
    sub: 'Live. The model searches the eCFR over MCP and reads one paragraph.',
    benefit: 'Current, cited and checkable to the paragraph.',
    cost: 'Slowest and most fragile: several calls, each of which can fail or read the wrong paragraph.',
    watch: 'It shows its work. The search words, the section it read, and the paragraph it answered from are all visible. That trail is what an auditor would ask for, and what memory can never provide.',
    run: runEcfr
  },
  {
    id: 'vector',
    title: 'Vector database',
    sub: '2 CFR 200 as embedded passages. The nearest four are handed over.',
    benefit: 'Fast, cheap and private: the whole corpus searched by meaning, in your browser.',
    cost: 'Only as current as the day it was built, and a near miss looks like a hit.',
    watch: 'The index is close. It often lands near the right passage without landing on it, and the answer is a blend of what it found and what it remembered. The similarity scores are right there.',
    run: runVector
  },
  {
    id: 'end',
    title: 'To end on',
    sub: 'Five answers to one question. Now the question behind them.',
    discussion: true
  }
];

/* ── DOM helpers ── */

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c === null || c === undefined) continue;
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return node;
}

function link(href, text) {
  return el('a', { href, target: '_blank', rel: 'noopener', text });
}

function clip(text, n = 220) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  return t.length > n ? t.slice(0, n - 1) + '…' : t;
}

function expandable(summary, fullText) {
  return el('details', { class: 'trail-text' }, [
    el('summary', { text: summary }),
    el('pre', { text: fullText })
  ]);
}

/* ── One way at a time ── */

const state = {};      // id -> {status, answer, kind, trail: Node[], meta}
let current = 0;       // index into WAYS
let question = '';

function resetState() {
  for (const w of WAYS) state[w.id] = { status: '', answer: '', kind: 'muted', trail: [], meta: '', ran: false };
}

function buildMethodPicker() {
  const select = $('method');
  select.textContent = '';
  WAYS.forEach((w, i) => select.appendChild(el('option', { value: String(i), text: w.discussion ? w.title : `${i + 1}. ${w.title}` })));
  select.addEventListener('change', () => show(Number(select.value), true));
}

function paintSteps() {
  $('method').value = String(current);
  $('method').classList.toggle('is-end', !!WAYS[current].discussion);
}

// Show way i. With run=true, run it if it has not run for this question yet.
function show(i, run) {
  current = Math.max(0, Math.min(WAYS.length - 1, i));
  const w = WAYS[current];
  paintSteps();
  render(w);
  $('prev').disabled = current === 0;
  $('rerun').hidden = !!w.discussion;
  if (run && !w.discussion && question && !state[w.id].ran) runWay(w);
}

function render(w) {
  const panel = $('way');
  panel.dataset.way = w.id;
  $('way-num').textContent = String(current + 1);
  $('way-title').textContent = w.title;
  $('way-sub').textContent = w.sub;
  $('way-body').hidden = !!w.discussion;
  $('way-end').hidden = !w.discussion;
  if (w.discussion) return;
  $('way-benefit').textContent = w.benefit;
  $('way-cost').textContent = w.cost;
  $('way-watch').textContent = w.watch;
  $('paste-box').hidden = w.id !== 'paste';
  const st = state[w.id];
  $('way-status').textContent = st.status;
  panel.classList.toggle('is-busy', !!st.status);
  const a = $('way-answer');
  a.textContent = st.answer || (question ? '' : 'Enter a question above to begin.');
  a.className = 'way-answer' + (st.kind ? ' is-' + st.kind : '');
  const body = $('trail-body');
  body.textContent = '';
  for (const n of st.trail) body.appendChild(n);
  $('way-trail').hidden = !st.trail.length;
  $('way-meta').textContent = st.meta;
}

function isCurrent(id) { return WAYS[current].id === id; }

function setStatus(id, text) {
  state[id].status = text || '';
  if (isCurrent(id)) { $('way-status').textContent = state[id].status; $('way').classList.toggle('is-busy', !!text); }
}

function setAnswer(id, text, kind) {
  state[id].answer = text;
  state[id].kind = kind || '';
  if (isCurrent(id)) { const a = $('way-answer'); a.textContent = text; a.className = 'way-answer' + (kind ? ' is-' + kind : ''); }
}

function setTrail(id, nodes) {
  state[id].trail = [].concat(nodes).filter(Boolean);
  if (isCurrent(id)) render(WAYS[current]);
}

function setMeta(id, text) {
  state[id].meta = text || '';
  if (isCurrent(id)) $('way-meta').textContent = state[id].meta;
}

function fail(id, err) {
  setStatus(id, '');
  setAnswer(id, (err && err.message) ? err.message : String(err), 'error');
}

async function runWay(w) {
  if (!hasAPIKey()) { openModal('key-modal'); return; }
  const st = state[w.id];
  if (st.running) return;
  st.running = true;
  st.ran = true;
  st.answer = ''; st.kind = ''; st.trail = []; st.meta = '';
  render(w);
  paintSteps();
  const t0 = performance.now();
  try {
    await w.run(question);
  } catch (err) {
    fail(w.id, err);
  }
  st.running = false;
  setMeta(w.id, `${((performance.now() - t0) / 1000).toFixed(1)} s, ${currentModel()}`);
}

/* ── The box for the pasted-context way ── */

function pastedText() {
  return $('paste-text').value.trim();
}

// Fetch 200.414(f) as it stood on a day, or today, into the paste box. Two versions
// of the same paragraph: the model will answer from whichever you hand it.
async function fillPaste(date) {
  const box = $('paste-text');
  box.value = 'Fetching 2 CFR 200.414(f)' + (date ? ' as of ' + date : '') + '\u2026';
  try {
    const args = { title: 2, part: '200', section: '200.414' };
    if (date) args.date = date;
    const first = await callMCPTool(ecfr.ECFR_MCP_URL, 'ecfr_get_regulation', args);
    let text = first.text || '';
    let pin = first.pinpoint || first.citation || '2 CFR 200.414';
    if (first.truncated && Array.isArray(first.outline)) {
      const line = first.outline.find(l => /\(f\)/.test(String(l))) || first.outline[0];
      const offset = parseInt(String(line).split(':')[0], 10);
      const chunk = await callMCPTool(ecfr.ECFR_MCP_URL, 'ecfr_get_regulation', Object.assign({ offset }, args));
      text = chunk.text || text;
      pin = chunk.pinpoint || pin;
    }
    box.value = `${pin}, eCFR text in force ${first.date || date || 'today'}:\n\n${text.trim()}`;
  } catch (e) {
    box.value = 'Could not fetch it: ' + e.message;
  }
}

function askWithPaste() {
  if (!question) { ask(); return; }
  state.paste.ran = false;
  show(WAYS.findIndex(w => w.id === 'paste'), true);
}

function wirePaste() {
  $('paste-run').addEventListener('click', askWithPaste);
  $('paste-text').addEventListener('keydown', e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) askWithPaste(); });
  $('paste-fill-current').addEventListener('click', () => fillPaste(null));
  $('paste-fill-old').addEventListener('click', () => fillPaste('2023-10-01'));
  $('paste-clear').addEventListener('click', () => { $('paste-text').value = ''; });
}

/* ── The five runs ── */

async function runMemory(question) {
  setStatus('memory', 'Asking the model…');
  const system = `You are answering a research compliance question about federal awards. Answer from what you know. ${ANSWER_RULES}`;
  const answer = await callModel(system, question);
  setStatus('memory', '');
  setAnswer('memory', answer);
  setTrail('memory', [
    el('p', { class: 'trail-note', text: 'Nothing but the question. No text, no search, no date. Whatever the model says here is what it absorbed before its training ended.' }),
    expandable('System prompt', system)
  ]);
}

async function runPaste(question) {
  const pasted = pastedText();
  if (!pasted) {
    setAnswer('paste', 'Nothing pasted. Put a passage in the box above and ask with it.', 'muted');
    setTrail('paste', el('p', { class: 'trail-note', text: 'Nothing. This way only works when you have done the reading.' }));
    return;
  }
  setStatus('paste', 'Asking the model, with your text in hand…');
  const system = `Answer the question using only the text supplied. ${ANSWER_RULES} If the text names where it comes from, cite that. If the text does not answer the question, say so and do not guess.`;
  const user = `Question: ${question}\n\nText:\n${pasted}`;
  const answer = await callModel(system, user);
  setStatus('paste', '');
  setAnswer('paste', answer);
  setTrail('paste', [
    el('p', { class: 'trail-note', text: `${pasted.length.toLocaleString()} characters you pasted. The model does not know where they came from, how old they are, or whether they are the governing text. You do, or you should.` }),
    expandable('The pasted text', pasted),
    expandable('System prompt', system)
  ]);
}

async function runWeb(question) {
  setStatus('web', 'Searching the web for the question as typed…');
  const search = await webSearch(question, 8);
  const trail = [
    el('p', { class: 'trail-note', text: `Query: “${search.query}”. ${search.results.length} results, titles and snippets only. No page was read in full.` + (search.dropped ? ` ${search.dropped} dropped by safe search.` : '') }),
    el('ol', { class: 'trail-list' }, search.results.map(r => el('li', {}, [
      link(r.url, r.title || r.url),
      el('span', { class: 'trail-engines', text: r.engines.length ? ' ' + r.engines.join(', ') : '' }),
      el('p', { text: clip(r.snippet, 200) })
    ])))
  ];
  if (!search.results.length) {
    setStatus('web', '');
    setAnswer('web', 'The search returned nothing, so the model was given nothing.', 'muted');
    setTrail('web', trail);
    return;
  }
  setStatus('web', `Asking the model, with ${search.results.length} snippets in hand…`);
  const system = `Answer the question using only the web search results supplied: their titles, addresses and snippets. ${ANSWER_RULES} Name the result you relied on by its number and address. If the snippets do not settle the question, say so and do not guess. Snippets may be from different years and from anyone; prefer an official source and say if the results disagree.`;
  const user = `Question: ${question}\n\nSearch results:\n${formatResults(search.results)}`;
  const answer = await callModel(system, user);
  setStatus('web', '');
  setAnswer('web', answer);
  trail.push(expandable('System prompt', system));
  setTrail('web', trail);
}

async function runVector(question) {
  setStatus('vector', 'Embedding the question and ranking 1,103 passages…');
  const passages = await retrieve(question, 4, vectorProgress);
  const info = await indexInfo();
  const trail = [
    el('p', { class: 'trail-note', text: `The question was embedded with ${info.embedding.model.replace(/^.*\//, '')} in this browser and compared with every passage of 2 CFR 200 (eCFR text current as of ${info.source_date}). The four nearest, by cosine similarity, were handed over in this order.` }),
    el('ol', { class: 'trail-list' }, passages.map(p => el('li', {}, [
      link(p.url, p.pin),
      el('span', { class: 'trail-score', text: ' ' + p.score.toFixed(3) }),
      el('p', { text: clip(p.text, 200) }),
      expandable('Full passage', p.text)
    ])))
  ];
  setStatus('vector', `Asking the model, with ${passages.length} passages in hand…`);
  const system = `Answer the question using only the regulation passages supplied. ${ANSWER_RULES} Name the pinpoint citation of the passage you relied on. If no passage answers the question, say so and do not guess.`;
  const user = `Question: ${question}\n\nPassages from 2 CFR 200 (eCFR, current as of ${info.source_date}):\n${formatPassages(passages)}`;
  const answer = await callModel(system, user);
  setStatus('vector', '');
  setAnswer('vector', answer);
  trail.push(expandable('System prompt', system));
  setTrail('vector', trail);
}

// Step 1 of the live lookup: the model turns the question into two or three search words.
async function searchWords(question) {
  try {
    const reply = await callModel(
      'You turn a question into search words for a full-text search of 2 CFR 200, the Uniform Guidance. A section matches only when it contains every word, so give the two or three words most likely to appear in the governing section. Reply with the words only, lower case, no punctuation.',
      question,
      { maxTokens: 40 }
    );
    const words = reply.toLowerCase().replace(/[^a-z0-9.\s-]/g, ' ').trim().split(/\s+/).filter(Boolean);
    if (words.length >= 1 && words.length <= 4) return { words, by: 'model' };
  } catch { /* fall through */ }
  return { words: ecfr.keywordsFromQuestion(question, 3), by: 'keywords' };
}

// Step 2b: when a section is long, the model picks the one paragraph to read.
async function chooseChunk(outline, question) {
  const reply = await callModel(
    'A regulation section is long, so only one of its paragraphs will be read. Given the question and the numbered list of paragraph headings, reply with the number of the single paragraph most likely to answer the question. Reply with the number only.',
    `Question: ${question}\n\nParagraphs:\n` + outline.map((line, i) => `${i + 1}. ${String(line).replace(/^\d+:\s*/, '')}`).join('\n'),
    { maxTokens: 10 }
  );
  const n = parseInt(reply.replace(/[^0-9]/g, ''), 10);
  if (Number.isNaN(n) || n < 1 || n > outline.length) throw new Error('no pick');
  return n - 1;
}

async function runEcfr(question) {
  setStatus('ecfr', 'Choosing search words…');
  const chosen = await searchWords(question);
  const { hit, trail: steps } = await ecfr.lookupUniformGuidance(chosen.words, {
    question,
    chooseChunk,
    onStatus: s => setStatus('ecfr', s)
  });
  const trail = [
    el('p', { class: 'trail-note', text: `Search words “${chosen.words.join(' ')}”, chosen by the ${chosen.by === 'model' ? 'model' : 'keyword fallback'}.` }),
    el('ol', { class: 'trail-list' }, steps.map(s => {
      if (s.step === 'ecfr_search') {
        return el('li', {}, [
          el('code', { text: `ecfr_search “${s.query}”` }),
          el('p', { text: s.hits.length ? 'Top: ' + s.hits.map(h => h.citation + (h.heading ? ' ' + h.heading : '')).join('; ') : 'No section in 2 CFR 200 has every word.' })
        ]);
      }
      return el('li', {}, [
        el('code', { text: `ecfr_get_regulation ${s.citation}` }),
        el('p', { text: s.paragraph ? `Paragraph ${s.paragraph}, picked by the ${s.chosenBy} out of ${s.of}.` : (s.outline ? `Long section: came back as an outline of ${s.outline} paragraphs.` : 'Short section: read whole.') })
      ]);
    }))
  ];
  if (!hit) {
    setStatus('ecfr', '');
    setAnswer('ecfr', `The eCFR search of 2 CFR 200 found no section for “${chosen.words.join(' ')}”, so the model was given nothing and should not guess.`, 'muted');
    setTrail('ecfr', trail);
    return;
  }
  setStatus('ecfr', `Asking the model, with ${hit.pinpoint || hit.citation} in hand…`);
  const system = `Answer the compliance question using only the regulation text supplied. ${ANSWER_RULES} If the text does not answer the question, say so and do not guess.`;
  const user = `Question: ${question}\n\nRegulation text (${hit.pinpoint || hit.citation}, eCFR as of ${hit.date}):\n${hit.text}`;
  const answer = await callModel(system, user);
  setStatus('ecfr', '');
  setAnswer('ecfr', answer);
  trail.push(el('p', { class: 'trail-source' }, [
    'Read: ', hit.sourceUrl ? link(hit.sourceUrl, hit.pinpoint || hit.citation) : (hit.pinpoint || hit.citation),
    hit.date ? `, eCFR text in force ${hit.date}` : ''
  ]));
  trail.push(expandable('The paragraph the model answered from', hit.text));
  trail.push(expandable('System prompt', system));
  setTrail('ecfr', trail);
}

/* ── A new question ── */

function ask() {
  const q = $('question').value.trim() || $('question').placeholder;
  question = q;
  $('question').value = q;
  resetState();
  show(WAYS[current].discussion ? 0 : current, true);
  $('way').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ── The embedding model's one-time download ── */

const progressFiles = {};
let vectorReady = false;
function vectorProgress(p) {
  if (!p || !p.file) return;
  if (p.status === 'progress') progressFiles[p.file] = { loaded: p.loaded || 0, total: p.total || 0 };
  if (p.status === 'done') progressFiles[p.file] = { loaded: p.total || 1, total: p.total || 1, done: true };
  const all = Object.values(progressFiles);
  const total = all.reduce((n, f) => n + f.total, 0);
  const loaded = all.reduce((n, f) => n + f.loaded, 0);
  if (total && !vectorReady) {
    setStatus('vector', `Loading the embedding model in this browser, once: ${Math.round(100 * loaded / total)}% of ${(total / 1048576).toFixed(0)} MB…`);
  }
}

async function warmVector() {
  try {
    setStatus('vector', 'Loading the index…');
    const info = await indexInfo();
    await loadModel(vectorProgress);
    vectorReady = true;
    setStatus('vector', '');
    if (!state.vector.ran) setAnswer('vector', `Ready: ${info.embedding.count.toLocaleString()} passages of 2 CFR 200, eCFR text current as of ${info.source_date}, embedded with ${info.embedding.model.replace(/^.*\//, '')}.`, 'muted');
  } catch (e) {
    setStatus('vector', '');
    setAnswer('vector', 'The embedding model could not load: ' + e.message, 'error');
  }
}

/* ── Key modal and model picker ── */

function openModal(id) { $(id).classList.add('visible'); }
function closeModal(id) { $(id).classList.remove('visible'); }

function wireModals() {
  document.querySelectorAll('[data-open]').forEach(b => b.addEventListener('click', () => openModal(b.dataset.open)));
  document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => closeModal(b.dataset.close)));
  document.querySelectorAll('.modal-overlay').forEach(m => m.addEventListener('click', e => { if (e.target === m) m.classList.remove('visible'); }));
  document.addEventListener('keydown', e => { if (e.key === 'Escape') document.querySelectorAll('.modal-overlay.visible').forEach(m => m.classList.remove('visible')); });
}

async function refreshModels() {
  const select = $('model');
  const key = getKey();
  select.innerHTML = '';
  const fallback = currentModel();
  select.appendChild(el('option', { value: fallback, text: fallback }));
  if (!key) return;
  try {
    const models = await listModels();
    select.innerHTML = '';
    if (!models.includes(fallback)) models.unshift(fallback);
    for (const id of models) select.appendChild(el('option', { value: id, text: id }));
    select.value = fallback;
  } catch { /* keep the default alone */ }
}

function updateKeyStatus() {
  const dot = $('api-key-dot');
  const status = $('api-key-status');
  const input = $('api-key-input');
  const label = $('api-key-label');
  if (hasAPIKey()) {
    dot.classList.add('connected');
    status.textContent = `${backendName()} key is set for this tab.`;
    status.className = 'api-key-status ok';
    input.value = '';
    input.placeholder = '•••••••• (saved)';
    label.textContent = isMindRouterKey(getKey()) ? 'MindRouter key' : 'Gemini key';
  } else {
    dot.classList.remove('connected');
    status.textContent = '';
    status.className = 'api-key-status';
    input.placeholder = 'mr2_… for MindRouter, or a Gemini key';
    label.textContent = 'API key';
  }
}

function wireKey() {
  $('api-key-save').addEventListener('click', () => {
    const val = $('api-key-input').value.trim();
    if (!val) return;
    setKey(val);
    initAPI(val);
    setModel('');
    updateKeyStatus();
    refreshModels();
  });
  $('api-key-input').addEventListener('keydown', e => { if (e.key === 'Enter') $('api-key-save').click(); });
  $('api-key-clear').addEventListener('click', () => {
    setKey('');
    initAPI('');
    updateKeyStatus();
    refreshModels();
  });
  $('model').addEventListener('change', e => setModel(e.target.value));
}

/* ── Start ── */

function init() {
  resetState();
  buildMethodPicker();
  wireModals();
  wireKey();
  wirePaste();

  const presets = $('presets');
  for (const q of PRESETS) {
    presets.appendChild(el('button', { type: 'button', class: 'preset', text: clip(q, 64), title: q, onclick: () => { $('question').value = q; ask(); } }));
  }
  $('ask').addEventListener('click', ask);
  $('method').addEventListener('keydown', e => { if (e.key === 'Enter') ask(); });
  $('question').addEventListener('keydown', e => { if (e.key === 'Enter') ask(); });
  $('prev').addEventListener('click', () => show(current - 1, true));
  $('rerun').addEventListener('click', () => { state[WAYS[current].id].ran = false; show(current, true); });
  // Arrow keys step through the ways when the focus is not in a text field.
  document.addEventListener('keydown', e => {
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) return;
    if (document.querySelector('.modal-overlay.visible')) return;
    if (e.key === 'ArrowRight') show(current + 1, true);
    if (e.key === 'ArrowLeft') show(current - 1, true);
  });

  const key = readKeyFromURL();
  if (key) initAPI(key);
  updateKeyStatus();
  refreshModels();
  show(0, false);
  if (key && wasKeyLoadedFromURL()) {
    const toast = $('toast');
    toast.textContent = `${backendName(key)} key loaded for this tab.`;
    toast.classList.add('visible');
    setTimeout(() => toast.classList.remove('visible'), 6000);
  } else if (!key) {
    openModal('key-modal');
  }

  // Start the one-time download of the embedding model while people read the page.
  setTimeout(warmVector, 800);
}

document.addEventListener('DOMContentLoaded', init);
