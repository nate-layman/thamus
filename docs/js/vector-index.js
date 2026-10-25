// The vector database column. scripts/ cut 2 CFR 200 into passages and had each
// backend embed them; docs/index/ holds the passages and one file of vectors per
// backend. The page asks the backend that holds the key to embed the question (the
// same model that embedded the passages), then ranks every passage by cosine
// similarity here, in the browser. No model is downloaded. This is what most
// products call retrieval-augmented generation.
import { BACKENDS } from './embeddings.js';

export const INDEX_URL = 'index/chunks.json';

let metaPromise = null;
const vectorPromises = {};

function loadMeta() {
  if (!metaPromise) {
    metaPromise = fetch(INDEX_URL).then(r => {
      if (!r.ok) throw new Error(`Could not load the index (${r.status}).`);
      return r.json();
    });
    metaPromise.catch(() => { metaPromise = null; });
  }
  return metaPromise;
}

/** The index's record for a backend's vectors, or null when they have not been built. */
export async function embeddingInfo(backend) {
  const meta = await loadMeta();
  return (meta.embeddings && meta.embeddings[backend]) || null;
}

function loadVectors(backend) {
  if (!vectorPromises[backend]) {
    vectorPromises[backend] = (async () => {
      const meta = await loadMeta();
      const info = meta.embeddings && meta.embeddings[backend];
      if (!info) throw new Error(`The index has no ${BACKENDS[backend].label} vectors yet. Run scripts/embed_corpus.mjs with that key.`);
      if (info.model !== BACKENDS[backend].model || info.dims !== BACKENDS[backend].dims) {
        throw new Error(`The ${BACKENDS[backend].label} vectors were built with ${info.model} at ${info.dims} dims, not the ${BACKENDS[backend].model} the page asks. Rebuild them.`);
      }
      const buf = await (await fetch(INDEX_URL.replace(/[^/]*$/, info.file))).arrayBuffer();
      const vectors = new Float32Array(buf);
      if (vectors.length !== info.dims * info.count) throw new Error(`${info.file} does not match chunks.json.`);
      return { meta, info, vectors };
    })();
    vectorPromises[backend].catch(() => { delete vectorPromises[backend]; });
  }
  return vectorPromises[backend];
}

/** Load the index and a backend's vectors ahead of the first question. */
export async function warm(backend) {
  const { meta, info } = await loadVectors(backend);
  return { meta, info };
}

export function indexInfo() {
  return loadMeta();
}

/**
 * Embed the question with the backend and return the k nearest passages with their scores.
 * @param {string} question
 * @param {'mindrouter'|'gemini'} backend
 * @param {(text: string) => Promise<Float32Array>} embedQuery  embeds one already-wrapped text
 */
export async function retrieve(question, backend, embedQuery, k = 4) {
  const [{ meta, info, vectors }, q] = await Promise.all([
    loadVectors(backend),
    embedQuery(BACKENDS[backend].query(question))
  ]);
  const { dims, count } = info;
  const scores = new Float32Array(count);
  for (let r = 0; r < count; r++) {
    let s = 0;
    const base = r * dims;
    for (let d = 0; d < dims; d++) s += q[d] * vectors[base + d];
    scores[r] = s;
  }
  const order = Array.from(scores.keys()).sort((a, b) => scores[b] - scores[a]).slice(0, k);
  return order.map(r => Object.assign({ score: scores[r] }, meta.chunks[r]));
}

// The passages as the model sees them.
export function formatPassages(passages) {
  return passages.map((p, i) => `[${i + 1}] ${p.pin}\n${p.heading}\n${p.text}`).join('\n\n');
}
