// The vector database column. scripts/ cut 2 CFR 200 into passages and embedded them
// with a small sentence-embedding model; the page loads the same model in the browser
// (through transformers.js, about 23 MB once, then cached), embeds the question, and
// ranks every passage by cosine similarity. Nothing leaves the browser for this step.
// This is what most products call retrieval-augmented generation.

export const TRANSFORMERS_URL = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.1/dist/transformers.min.js';
export const INDEX_URL = 'index/chunks.json';

let indexPromise = null;
let modelPromise = null;

function loadIndex() {
  if (!indexPromise) {
    indexPromise = (async () => {
      const meta = await (await fetch(INDEX_URL)).json();
      if (!meta.embedding) throw new Error('The index has no embeddings. Run scripts/embed_corpus.mjs.');
      const binUrl = INDEX_URL.replace(/[^/]*$/, meta.embedding.file);
      const buf = await (await fetch(binUrl)).arrayBuffer();
      const vectors = new Float32Array(buf);
      const { dims, count } = meta.embedding;
      if (vectors.length !== dims * count) throw new Error('embeddings.bin does not match chunks.json.');
      return { meta, vectors, dims, count };
    })();
    indexPromise.catch(() => { indexPromise = null; });
  }
  return indexPromise;
}

/**
 * Load the embedding model in the browser. onProgress gets {status, file, progress}
 * from transformers.js, and is how the page shows the one-time download.
 */
export function loadModel(onProgress) {
  if (!modelPromise) {
    modelPromise = (async () => {
      const index = await loadIndex();
      const { pipeline, env } = await import(TRANSFORMERS_URL);
      env.allowLocalModels = false;
      const { model, dtype } = index.meta.embedding;
      const embed = await pipeline('feature-extraction', model, { dtype, progress_callback: onProgress });
      return { embed, index };
    })();
    modelPromise.catch(() => { modelPromise = null; });
  }
  return modelPromise;
}

export function indexInfo() {
  return loadIndex().then(i => i.meta);
}

export function isReady() {
  return !!modelPromise;
}

/**
 * Embed the question and return the k nearest passages with their scores.
 */
export async function retrieve(question, k = 4, onProgress) {
  const { embed, index } = await loadModel(onProgress);
  const t = await embed([question], { pooling: 'mean', normalize: true });
  const q = t.data;
  const { vectors, dims, count, meta } = index;
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
