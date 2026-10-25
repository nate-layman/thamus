// Embed the passages in docs/index/chunks.json, once per backend, with the model the
// page will use to embed the question (docs/js/embeddings.js, imported here so the two
// cannot drift). Writes docs/index/embeddings-<backend>.bin (float32, row-major,
// L2-normalized) and records each backend's model, dimensions and count in chunks.json.
//
//   MINDROUTER_API_KEY=mr2_... GEMINI_API_KEY=... node embed_corpus.mjs
//   node embed_corpus.mjs gemini        # one backend; the other's vectors are kept
//
// With no backend named, every backend whose key is set is built. MINDROUTER_BASE_URL
// points the MindRouter calls somewhere other than the public proxy.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { BACKENDS, embedTexts } from '../docs/js/embeddings.js';

const here = dirname(fileURLToPath(import.meta.url));
const indexDir = join(here, '..', 'docs', 'index');
const chunksPath = join(indexDir, 'chunks.json');

const KEYS = { mindrouter: process.env.MINDROUTER_API_KEY, gemini: process.env.GEMINI_API_KEY };
const ENV_NAMES = { mindrouter: 'MINDROUTER_API_KEY', gemini: 'GEMINI_API_KEY' };

const named = process.argv.slice(2);
for (const b of named) if (!BACKENDS[b]) throw new Error(`Unknown backend "${b}". Use ${Object.keys(BACKENDS).join(' or ')}.`);
const backends = named.length ? named : Object.keys(BACKENDS).filter(b => KEYS[b]);
if (!backends.length) {
  console.error(`Set ${Object.values(ENV_NAMES).join(' and/or ')} to build that backend's vectors.`);
  process.exit(1);
}

const data = JSON.parse(readFileSync(chunksPath, 'utf8'));
const chunks = data.chunks;
data.embeddings = data.embeddings || {};
delete data.embedding;  // the in-browser model's record, from before the backends embedded

// The questions the README says to try should land on the passages that answer them.
const probes = [
  ['What de minimis indirect cost rate may a recipient without a negotiated rate charge?', '2 CFR 200.414(f)'],
  ['What is the per-unit cost threshold for equipment?', '2 CFR 200.1, "Equipment"'],
  ['How much of each subaward counts toward modified total direct costs?', '2 CFR 200.1, "Modified Total Direct Cost (MTDC)"'],
  ['Are alcoholic beverages an allowable cost?', '2 CFR 200.423'],
];

for (const backend of backends) {
  const spec = BACKENDS[backend];
  const key = KEYS[backend];
  if (!key) throw new Error(`Set ${ENV_NAMES[backend]} to build the ${backend} vectors.`);
  console.error(`${backend}: ${chunks.length} passages with ${spec.model}, ${spec.dims} dims`);
  const out = new Float32Array(chunks.length * spec.dims);
  const t0 = Date.now();
  for (let i = 0; i < chunks.length; i += spec.batch) {
    const batch = chunks.slice(i, i + spec.batch).map(spec.passage);
    const vectors = await embedTexts(backend, key, batch, { retries: 6, baseUrl: process.env.MINDROUTER_BASE_URL });
    vectors.forEach((v, j) => out.set(v, (i + j) * spec.dims));
    console.error(`  ${Math.min(i + spec.batch, chunks.length)}/${chunks.length}`);
  }
  console.error(`  embedded in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  writeFileSync(join(indexDir, spec.file), Buffer.from(out.buffer));
  data.embeddings[backend] = { model: spec.model, dims: spec.dims, count: chunks.length, normalized: true, file: spec.file, built: new Date().toISOString() };
  writeFileSync(chunksPath, JSON.stringify(data));
  console.error(`  wrote ${spec.file} (${out.byteLength.toLocaleString()} bytes) and updated chunks.json`);

  const queries = await embedTexts(backend, key, probes.map(([q]) => spec.query(q)), { retries: 6, baseUrl: process.env.MINDROUTER_BASE_URL });
  probes.forEach(([q, want], p) => {
    const qv = queries[p];
    const scores = [];
    for (let r = 0; r < chunks.length; r++) {
      let s = 0;
      for (let d = 0; d < spec.dims; d++) s += qv[d] * out[r * spec.dims + d];
      scores.push([s, r]);
    }
    scores.sort((a, b) => b[0] - a[0]);
    const top = scores.slice(0, 5).map(([s, r]) => `${chunks[r].pin} ${s.toFixed(3)}`);
    const rank = scores.findIndex(([, r]) => chunks[r].pin === want);
    console.error(`\n${q}\n  want ${want}: rank ${rank + 1}\n  top: ${top.join(' | ')}`);
  });
  console.error('');
}
