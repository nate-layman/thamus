// Embed the passages in docs/index/chunks.json with the same model and quantization
// the page uses in the browser, so query vectors and passage vectors agree.
// Writes docs/index/embeddings.bin (float32, row-major, L2-normalized) and records
// the model, dimensions and count in chunks.json.
import { pipeline, env } from '@huggingface/transformers';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const indexDir = join(here, '..', 'docs', 'index');
const chunksPath = join(indexDir, 'chunks.json');

export const MODEL = 'Xenova/all-MiniLM-L6-v2';
export const DTYPE = 'q8';

env.allowLocalModels = false;

const data = JSON.parse(readFileSync(chunksPath, 'utf8'));
const chunks = data.chunks;
console.error(`${chunks.length} passages; loading ${MODEL} (${DTYPE})`);

const embed = await pipeline('feature-extraction', MODEL, { dtype: DTYPE });

// The same text the page shows is what gets embedded, with the section heading in
// front so a paragraph that says only "(f) De minimis rate..." still knows its section.
function embeddingText(c) {
  const where = c.sub && !c.text.startsWith(c.sub) ? ' ' + c.sub : '';
  return `${c.heading}${where}\n${c.text}`;
}

const BATCH = 32;
let dims = 0;
let out = null;
const t0 = Date.now();
for (let i = 0; i < chunks.length; i += BATCH) {
  const batch = chunks.slice(i, i + BATCH).map(embeddingText);
  const t = await embed(batch, { pooling: 'mean', normalize: true });
  if (!out) {
    dims = t.dims[1];
    out = new Float32Array(chunks.length * dims);
  }
  out.set(t.data, i * dims);
  if ((i / BATCH) % 5 === 0) console.error(`  ${Math.min(i + BATCH, chunks.length)}/${chunks.length}`);
}
console.error(`embedded in ${((Date.now() - t0) / 1000).toFixed(1)}s, ${dims} dims`);

writeFileSync(join(indexDir, 'embeddings.bin'), Buffer.from(out.buffer));
data.embedding = { model: MODEL, dtype: DTYPE, dims, count: chunks.length, pooling: 'mean', normalized: true, file: 'embeddings.bin' };
writeFileSync(chunksPath, JSON.stringify(data));
console.error(`wrote embeddings.bin (${out.byteLength.toLocaleString()} bytes) and updated chunks.json`);

// Sanity check: the questions the README says to try should land on the passages that answer them.
const probes = [
  ['What de minimis indirect cost rate may a recipient without a negotiated rate charge?', '2 CFR 200.414(f)'],
  ['What is the per-unit cost threshold for equipment?', '2 CFR 200.1, "Equipment"'],
  ['How much of each subaward counts toward modified total direct costs?', '2 CFR 200.1, "Modified Total Direct Cost (MTDC)"'],
  ['Are alcoholic beverages an allowable cost?', '2 CFR 200.423'],
];
for (const [q, want] of probes) {
  const qv = (await embed([q], { pooling: 'mean', normalize: true })).data;
  const scores = [];
  for (let r = 0; r < chunks.length; r++) {
    let s = 0;
    for (let d = 0; d < dims; d++) s += qv[d] * out[r * dims + d];
    scores.push([s, r]);
  }
  scores.sort((a, b) => b[0] - a[0]);
  const top = scores.slice(0, 5).map(([s, r]) => `${chunks[r].pin} ${s.toFixed(3)}`);
  const rank = scores.findIndex(([, r]) => chunks[r].pin === want);
  console.error(`\n${q}\n  want ${want}: rank ${rank + 1}\n  top: ${top.join(' | ')}`);
}
