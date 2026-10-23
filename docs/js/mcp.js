// Minimal MCP client over streamable HTTP: one tools/call per request, no session.
// The AI4RA MCP server allows any browser origin, so the page calls it directly.
// A server may answer as JSON or as a server-sent event stream; both are handled.

export const MCP_BASE_URL = 'https://nlayman-external.insight.uidaho.edu/mcp';

export async function callMCPTool(serverUrl, toolName, args = {}) {
  let response;
  try {
    response = await fetch(serverUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method: 'tools/call', params: { name: toolName, arguments: args } })
    });
  } catch (e) {
    throw new Error(`Could not reach the MCP server (${e.message}).`);
  }
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`MCP request failed: ${response.status} ${text.slice(0, 200)}`);
  }
  const raw = await response.text();
  const payload = parseJsonRpc(raw);
  if (payload.error) throw new Error(payload.error.message || JSON.stringify(payload.error));
  const content = payload.result && payload.result.content;
  const text = Array.isArray(content) && content.length && typeof content[0].text === 'string' ? content[0].text : null;
  if (payload.result && payload.result.isError) {
    throw new Error(String(text || 'tool error').replace(/^Error executing tool \w+:\s*/, ''));
  }
  return text !== null ? parseToolResult(text) : payload.result;
}

function parseJsonRpc(raw) {
  const trimmed = raw.trim();
  if (trimmed.startsWith('{')) return JSON.parse(trimmed);
  // SSE: the last "data:" line that parses is the response
  let last = null;
  for (const line of trimmed.split('\n')) {
    if (line.startsWith('data:')) {
      try { last = JSON.parse(line.slice(5).trim()); } catch { /* keep looking */ }
    }
  }
  if (!last) throw new Error('The MCP server returned nothing readable.');
  return last;
}

// A tool result is a JSON string inside the first content part. A tool error comes back
// as plain prose ("Error executing tool ..."), so anything that is not JSON is an error.
function parseToolResult(text) {
  try {
    const data = JSON.parse(text);
    if (data && data.error) throw new Error(data.error.message || JSON.stringify(data.error));
    return data;
  } catch (e) {
    if (e instanceof SyntaxError) throw new Error(String(text).replace(/^Error executing tool \w+:\s*/, '').slice(0, 300));
    throw e;
  }
}
