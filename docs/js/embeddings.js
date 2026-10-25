// The embedding models behind the vector database column, one per backend. The page
// and scripts/embed_corpus.mjs both import this file, so the passages in docs/index/
// and the question the page asks are embedded by the same model, at the same size,
// with the same text around them. Change anything here and rebuild that backend's
// vectors. No model is downloaded to the browser: the backend embeds the question,
// and the page compares the result with the passage vectors it already holds.

export const BACKENDS = {
  // MindRouter's OpenAI-compatible /v1/embeddings. Qwen3-Embedding is trained so that
  // its first dimensions stand on their own (Matryoshka), so the 4,096 it returns are
  // cut to 1,024 and normalized again, which keeps the index a few megabytes.
  mindrouter: {
    label: 'MindRouter',
    model: 'Qwen/Qwen3-Embedding-8B',
    dims: 1024,
    file: 'embeddings-mindrouter.bin',
    batch: 32,
    query: q => `Instruct: Given a question about federal award regulations, retrieve the passage of 2 CFR 200 that answers it\nQuery: ${q}`,
    passage: c => `${c.heading}${subLabel(c)}\n${c.text}`
  },
  // Gemini's embedding model takes no task field; it reads the task from a prefix.
  gemini: {
    label: 'Google Gemini',
    model: 'gemini-embedding-2',
    dims: 768,
    file: 'embeddings-gemini.bin',
    batch: 100,
    query: q => `task: question answering | query: ${q}`,
    passage: c => `title: ${c.heading}${subLabel(c)} | text: ${c.text}`
  }
};

export const MINDROUTER_PUBLIC_URL = 'https://nlayman-external.insight.uidaho.edu/v1';
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

// A paragraph that says only "(f) De minimis rate..." still knows its section.
function subLabel(c) {
  return c.sub && !c.text.startsWith(c.sub) ? ' ' + c.sub : '';
}

/**
 * Embed texts with a backend. Returns one Float32Array per text, cut to the backend's
 * size and L2-normalized, so a dot product is the cosine similarity.
 * @param {'mindrouter'|'gemini'} backend
 * @param {string} key       the MindRouter or Gemini key
 * @param {string[]} texts   already wrapped with the backend's query() or passage()
 * @param {{baseUrl?: string, retries?: number}} [options]
 */
export async function embedTexts(backend, key, texts, options = {}) {
  const spec = BACKENDS[backend];
  const raw = backend === 'mindrouter'
    ? await embedMindRouter(spec, key, texts, options)
    : await embedGemini(spec, key, texts, options);
  return raw.map(v => normalize(v, spec.dims));
}

async function embedMindRouter(spec, key, texts, options) {
  const base = options.baseUrl || MINDROUTER_PUBLIC_URL;
  const data = await postJSON(`${base}/embeddings`, { Authorization: `Bearer ${key}` },
    { model: spec.model, input: texts }, 'MindRouter', options.retries);
  const rows = (data.data || []).slice().sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  if (rows.length !== texts.length) throw new Error(`MindRouter returned ${rows.length} embeddings for ${texts.length} texts.`);
  return rows.map(r => r.embedding);
}

async function embedGemini(spec, key, texts, options) {
  const model = `models/${spec.model}`;
  const data = await postJSON(`${GEMINI_URL}/${spec.model}:batchEmbedContents`, { 'x-goog-api-key': key },
    { requests: texts.map(text => ({ model, content: { parts: [{ text }] }, output_dimensionality: spec.dims })) },
    'Gemini', options.retries);
  const rows = data.embeddings || [];
  if (rows.length !== texts.length) throw new Error(`Gemini returned ${rows.length} embeddings for ${texts.length} texts.`);
  return rows.map(r => r.values);
}

// A rate limit or a busy backend is waited out, a few times, before giving up.
async function postJSON(url, headers, body, who, retries = 0) {
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(url, {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, headers),
      body: JSON.stringify(body)
    });
    if (response.ok) return response.json();
    if ((response.status === 429 || response.status >= 500) && attempt < retries) {
      const after = Number(response.headers.get('retry-after'));
      await new Promise(r => setTimeout(r, (after > 0 ? after : 2 ** attempt * 5) * 1000));
      continue;
    }
    let detail = '';
    try {
      const err = await response.json();
      detail = err.detail || err.error?.message || err.error || '';
    } catch { /* body was not JSON */ }
    if (response.status === 401 || response.status === 403) throw new Error(`${who} rejected the key for embeddings.`);
    throw new Error(`${who} embedding error ${response.status}${detail ? ': ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''}`);
  }
}

function normalize(values, dims) {
  if (!Array.isArray(values) || values.length < dims) throw new Error(`Expected at least ${dims} dimensions, got ${values ? values.length : 0}.`);
  const v = Float32Array.from(values.slice(0, dims));
  let n = 0;
  for (let i = 0; i < dims; i++) n += v[i] * v[i];
  n = Math.sqrt(n) || 1;
  for (let i = 0; i < dims; i++) v[i] /= n;
  return v;
}
