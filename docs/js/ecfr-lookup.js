// Live eCFR lookup through the AI4RA MCP server's ecfr server, adapted from the
// NCURA workshop deck. It follows the server's own instructions: ecfr_search limited
// to 2 CFR 200, then ecfr_get_regulation on the top hit. A section over 6,000
// characters comes back as an outline of its lettered paragraphs, and only the one
// paragraph that bears on the question is read, so each lookup is two or three small
// calls, never a whole section. Everything the lookup did is returned as a trail.
import { callMCPTool, MCP_BASE_URL } from './mcp.js';

export const ECFR_MCP_URL = `${MCP_BASE_URL}/ecfr/mcp`;

const STOPWORDS = new Set((
  'a an the of to for in on at by with without from under over into is are was were be been being ' +
  'do does did can could may might must shall should will would what which who whom whose when where ' +
  'how why that this these those it its their they them he she we you i my our your and or but if then ' +
  'than as about per any some all each every no not only also much many how charge charged use used ' +
  'allowed allow counts count toward recipient recipients subrecipient subrecipients federal award ' +
  'awards grant grants rule rules'
).split(/\s+/));

async function ecfrTool(name, args) {
  return callMCPTool(ECFR_MCP_URL, name, args);
}

// Content words of a question, most distinctive first by position. The eCFR search matches a
// section only when it has every word, so callers search with three, then fewer.
export function keywordsFromQuestion(question, max = 3) {
  const words = String(question)
    .toLowerCase()
    .replace(/[^a-z0-9.\s-]/g, ' ')
    .split(/\s+/)
    .filter(w => w && !STOPWORDS.has(w) && w.length > 1);
  const seen = [];
  words.forEach(w => { if (!seen.includes(w)) seen.push(w); });
  return seen.slice(0, max);
}

// Pick the outline entry whose heading best matches: the search words count double, since they
// are the distilled intent, and the question's other content words break ties. Index 0 when none match.
export function pickChunkByKeywords(outline, question, searchWords) {
  const strong = (Array.isArray(searchWords) ? searchWords : String(searchWords || '').split(/\s+/))
    .map(w => w.toLowerCase()).filter(Boolean);
  const weak = keywordsFromQuestion(question, 8).filter(w => !strong.includes(w));
  const hits = (heading, words) => words.reduce((n, w) =>
    n + (new RegExp('\\b' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + 's?\\b').test(heading) ? 1 : 0), 0);
  let best = 0;
  let bestScore = -1;
  outline.forEach((line, i) => {
    const heading = String(line).toLowerCase();
    const score = 2 * hits(heading, strong) + hits(heading, weak);
    if (score > bestScore) { best = i; bestScore = score; }
  });
  return best;
}

function outlineOffset(line) {
  const n = parseInt(String(line).split(':')[0], 10);
  return Number.isNaN(n) ? null : n;
}

export async function searchUniformGuidance(words, perPage = 3) {
  const data = await ecfrTool('ecfr_search', { query: words, title: 2, part: '200', per_page: perPage });
  return data.results || [];
}

async function searchWithFallback(words, trail, onStatus) {
  let list = Array.isArray(words) ? words.slice() : String(words).trim().split(/\s+/);
  while (list.length) {
    const query = list.join(' ');
    onStatus(`Searching 2 CFR 200 for “${query}”…`);
    const results = await searchUniformGuidance(query, 3);
    trail.push({ step: 'ecfr_search', query, hits: results.map(r => ({ citation: r.citation || ('2 CFR ' + r.section), heading: r.heading || '' })) });
    const top = results.find(r => r && r.section);
    if (top) return { top, query };
    list.pop();
  }
  return null;
}

/**
 * Search, then read the one paragraph of the top hit that bears on the question.
 * @param {string[]} words        the search words (the model's, or the keyword fallback)
 * @param {object}   options
 * @param {string}   options.question
 * @param {Function} [options.chooseChunk]  async (outline, question) => index; the model's pick
 * @param {Function} [options.onStatus]
 * @returns {Promise<null|object>}  null when nothing in 2 CFR 200 matches the words
 */
export async function lookupUniformGuidance(words, options = {}) {
  const onStatus = options.onStatus || (() => {});
  const trail = [];
  const found = await searchWithFallback(words, trail, onStatus);
  if (!found) return { hit: null, trail };
  const top = found.top;
  const args = { title: Number(top.title || 2), part: String(top.part || '200'), section: String(top.section) };

  onStatus(`Reading ${top.citation || ('2 CFR ' + top.section)}…`);
  const first = await ecfrTool('ecfr_get_regulation', args);
  let text = first.text || '';
  let pinpoint = first.pinpoint || first.citation || '';
  let chunkHeading = '';
  trail.push({ step: 'ecfr_get_regulation', citation: first.citation || ('2 CFR ' + args.section), outline: first.truncated ? (first.outline || []).length : 0 });

  if (first.truncated && Array.isArray(first.outline) && first.outline.length) {
    let index = null;
    let chooser = 'keywords';
    if (options.chooseChunk) {
      try {
        index = await options.chooseChunk(first.outline, options.question || words.join(' '));
        chooser = 'model';
      } catch {
        index = null;
      }
    }
    if (typeof index !== 'number' || index < 0 || index >= first.outline.length) {
      index = pickChunkByKeywords(first.outline, options.question || words.join(' '), found.query);
      chooser = 'keywords';
    }
    const offset = outlineOffset(first.outline[index]);
    chunkHeading = String(first.outline[index]).replace(/^\d+:\s*/, '').replace(/\s*\([\d,]+ chars\)\s*$/, '');
    onStatus(`Reading ${first.citation || args.section}, ${chunkHeading}…`);
    const chunk = await ecfrTool('ecfr_get_regulation', Object.assign({ offset }, args));
    text = chunk.text || '';
    pinpoint = chunk.pinpoint || pinpoint;
    trail.push({ step: 'ecfr_get_regulation', citation: pinpoint, paragraph: chunkHeading, chosenBy: chooser, of: first.outline.length });
  }

  return {
    trail,
    hit: {
      citation: first.citation || ('2 CFR ' + args.section),
      pinpoint,
      heading: top.heading || '',
      chunkHeading,
      date: first.date || '',
      sourceUrl: first.source_url || '',
      searchWords: found.query,
      text: text.trim()
    }
  };
}
