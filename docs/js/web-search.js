// Raw web search, through the AI4RA MCP server's general server: a SearXNG metasearch
// beside the process that merges Google, Bing, DuckDuckGo, Brave and others. The page
// sends the question itself as the query, hands the model only what a search returns
// (titles, addresses, snippets), and reads no page in full. That is the point of the
// column: this is what "just search for it" gives a model.
import { callMCPTool, MCP_BASE_URL } from './mcp.js';

export const GENERAL_MCP_URL = `${MCP_BASE_URL}/general/mcp`;

export async function webSearch(query, count = 8) {
  const data = await callMCPTool(GENERAL_MCP_URL, 'web_search', { query, count });
  return {
    query: data.query || query,
    results: (data.results || []).map(r => ({
      title: r.title || '',
      url: r.url || '',
      snippet: r.snippet || '',
      engines: Array.isArray(r.engines) ? r.engines : [],
      published: r.published || null
    })),
    dropped: data.dropped || 0
  };
}

// The results as the model sees them.
export function formatResults(results) {
  return results.map((r, i) => `[${i + 1}] ${r.title}\n${r.url}\n${r.snippet}`).join('\n\n');
}
