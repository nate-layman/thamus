// LLM bridge, adapted from Promptulus and Data Crawler Carl. One key box, two
// backends, chosen by the key itself:
//   - a University of Idaho MindRouter key (prefix "mr2_") goes to MindRouter, an
//     OpenAI-compatible gateway, through the public proxy on the AI4RA lakehouse VM
//     (MindRouter itself is campus-only, and the proxy adds the CORS headers a page
//     on github.io needs);
//   - any other key is treated as a Google Gemini key and goes to Google via the
//     @google/genai SDK loaded from an ESM CDN.
// Every column of the page asks the same model the same way: the model's default
// settings, one system prompt, one user message. Only what the model is handed differs.

const LOCAL = ['localhost', '127.0.0.1'].includes(window.location.hostname);
// On a laptop, scripts/serve.py serves docs/ and proxies /v1/* to MindRouter, because
// the public proxy only allows the published origins.
export const MINDROUTER_BASE_URL = LOCAL ? '/v1' : 'https://nlayman-external.insight.uidaho.edu/v1';
export const MINDROUTER_MODEL = 'qwen/qwen3.8-27b';
export const GEMINI_MODEL = 'gemini-3.8-flash';

let apiKey = '';

export function initAPI(key) {
  apiKey = (key || '').trim();
}

export function hasAPIKey() {
  return !!apiKey;
}

export function isMindRouterKey(key) {
  return typeof key === 'string' && key.trim().startsWith('mr2_');
}

export function backendName(key) {
  return isMindRouterKey(key === undefined ? apiKey : key) ? 'MindRouter' : 'Google Gemini';
}

// One model per backend, fixed. There is no picker: the comparison is between ways, not models.
export function currentModel() {
  return isMindRouterKey(apiKey) ? MINDROUTER_MODEL : GEMINI_MODEL;
}

/**
 * One question to the model. Returns the text, with any inline reasoning removed.
 * @param {string} system  the system prompt
 * @param {string} user    the user message
 * @param {{maxTokens?: number}} [options]
 */
export async function callModel(system, user, options = {}) {
  if (!apiKey) throw new Error('No key is set. Paste a MindRouter or Gemini key first.');
  const text = isMindRouterKey(apiKey)
    ? await callMindRouter(system, user, options)
    : await callGemini(system, user, options);
  return text.replace(/<think>[\s\S]*?<\/think>\s*/g, '').trim();
}

async function callMindRouter(system, user, options) {
  let response;
  try {
    response = await fetch(`${MINDROUTER_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: currentModel(),
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
        max_tokens: options.maxTokens || 400
      })
    });
  } catch (e) {
    throw new Error(`Could not reach MindRouter (${e.message}). ${LOCAL ? 'Run scripts/serve.py rather than a plain static server.' : 'The proxy may not allow this site’s origin.'}`);
  }
  if (!response.ok) {
    let detail = '';
    try {
      const err = await response.json();
      detail = err.detail || err.error?.message || err.error || '';
    } catch { /* body was not JSON */ }
    if (response.status === 401) throw new Error('MindRouter rejected the key. Check it and try again.');
    throw new Error(`MindRouter error ${response.status}${detail ? ': ' + detail : ''}`);
  }
  const data = await response.json();
  const text = data.choices?.[0]?.message?.content;
  if (typeof text !== 'string') throw new Error('MindRouter returned no text.');
  return text;
}

async function callGemini(system, user, options) {
  const { GoogleGenAI } = await import('https://esm.run/@google/genai');
  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: currentModel(),
    contents: [{ role: 'user', parts: [{ text: user }] }],
    config: {
      systemInstruction: system,
      maxOutputTokens: options.maxTokens || 400,
      thinkingConfig: { thinkingLevel: 'low' }
    }
  });
  const text = response.text;
  if (typeof text !== 'string') throw new Error('Gemini returned no text.');
  return text;
}
