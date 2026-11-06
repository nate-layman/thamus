// LLM bridge, adapted from Promptulus and Data Crawler Carl. One key box, three
// backends, chosen by the key itself:
//   - a University of Idaho MindRouter key (prefix "mr2_") goes to MindRouter, an
//     OpenAI-compatible gateway, through the public proxy on the AI4RA lakehouse VM
//     (MindRouter itself is campus-only, and the proxy adds the CORS headers a page
//     on github.io needs);
//   - an OpenAI key ("sk-", but not Anthropic's "sk-ant-") goes to OpenAI's chat
//     completions API;
//   - any other key is treated as a Google Gemini key and goes to Google via the
//     @google/genai SDK loaded from an ESM CDN.
// Every column of the page asks the same model the same way: the model's default
// settings, one system prompt, one user message. Only what the model is handed differs.

import { embedTexts, limitMessage, MINDROUTER_PUBLIC_URL } from './embeddings.js';

const LOCAL = ['localhost', '127.0.0.1'].includes(window.location.hostname);
// On a laptop, scripts/serve.py serves docs/ and proxies /v1/* to MindRouter, because
// the public proxy only allows the published origins.
export const MINDROUTER_BASE_URL = LOCAL ? '/v1' : MINDROUTER_PUBLIC_URL;
export const MINDROUTER_MODEL = 'qwen/qwen3.8-27b';
export const GEMINI_MODEL = 'gemini-3.5-flash-lite';
export const OPENAI_MODEL = 'gpt-6-luna';
const OPENAI_BASE_URL = 'https://api.openai.com/v1';

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

export function isOpenAIKey(key) {
  return typeof key === 'string' && key.trim().startsWith('sk-') && !key.trim().startsWith('sk-ant-');
}

export function backendName(key) {
  const k = key === undefined ? apiKey : key;
  return isMindRouterKey(k) ? 'MindRouter' : isOpenAIKey(k) ? 'OpenAI' : 'Google Gemini';
}

// One model per backend, fixed. There is no picker: the comparison is between ways, not models.
export function currentModel() {
  return isMindRouterKey(apiKey) ? MINDROUTER_MODEL : isOpenAIKey(apiKey) ? OPENAI_MODEL : GEMINI_MODEL;
}

// Which backend's embedding model the vector column asks, by the key it holds.
export function embeddingBackend() {
  return isMindRouterKey(apiKey) ? 'mindrouter' : isOpenAIKey(apiKey) ? 'openai' : 'gemini';
}

// One text, already wrapped for the backend, embedded by that backend's model.
export async function embedQuery(text) {
  if (!apiKey) throw new Error('No key is set. Paste a MindRouter or Gemini key first.');
  const [v] = await embedTexts(embeddingBackend(), apiKey, [text], { baseUrl: MINDROUTER_BASE_URL, retries: 1 });
  return v;
}

/**
 * One question to the model. Returns the text, with any inline reasoning removed.
 * @param {string} system  the system prompt
 * @param {string} user    the user message
 * @param {{maxTokens?: number}} [options]
 */
export async function callModel(system, user, options = {}) {
  if (!apiKey) throw new Error('No key is set. Paste a MindRouter or Gemini key first.');
  const call = isMindRouterKey(apiKey) ? callMindRouter : isOpenAIKey(apiKey) ? callOpenAI : callGemini;
  const text = await call(system, user, options);
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
    let err = null;
    try { err = await response.json(); } catch { /* body was not JSON */ }
    const detail = err ? (err.detail || err.error?.message || err.error || '') : '';
    if (response.status === 401) throw new Error('MindRouter rejected the key. Check it and try again.');
    const limit = limitMessage(response.status, err, 'MindRouter');
    if (limit) throw new Error(limit);
    throw new Error(`MindRouter error ${response.status}${detail ? ': ' + detail : ''}`);
  }
  const data = await response.json();
  const text = data.choices?.[0]?.message?.content;
  if (typeof text !== 'string') throw new Error('MindRouter returned no text.');
  return text;
}

async function callOpenAI(system, user, options) {
  const response = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: currentModel(),
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      max_completion_tokens: options.maxTokens || 400,
      // Left at the default, reasoning spends the same budget as the answer, and a
      // short budget comes back with no text at all.
      reasoning_effort: 'none'
    })
  });
  if (!response.ok) {
    let err = null;
    try { err = await response.json(); } catch { /* body was not JSON */ }
    if (response.status === 401) throw new Error('OpenAI rejected the key. Check it and try again.');
    const limit = limitMessage(response.status, err, 'OpenAI');
    if (limit) throw new Error(limit);
    throw new Error(`OpenAI error ${response.status}${err?.error?.message ? ': ' + err.error.message : ''}`);
  }
  const data = await response.json();
  const text = data.choices?.[0]?.message?.content;
  if (typeof text !== 'string' || !text.trim()) throw new Error('OpenAI returned no text.');
  return text;
}

async function callGemini(system, user, options) {
  const { GoogleGenAI } = await import('https://esm.run/@google/genai');
  const ai = new GoogleGenAI({ apiKey });
  let response;
  try {
    response = await ai.models.generateContent({
      model: currentModel(),
      contents: [{ role: 'user', parts: [{ text: user }] }],
      config: {
        systemInstruction: system,
        maxOutputTokens: options.maxTokens || 400,
        thinkingConfig: { thinkingLevel: 'minimal' }
      }
    });
  } catch (e) {
    // The SDK puts Google's whole JSON reply in the message. Say what it means instead.
    let err = null;
    try { err = JSON.parse(e.message); } catch { throw e; }
    const status = e.status || err?.error?.code;
    throw new Error(limitMessage(status, err, 'Gemini') || `Gemini error ${status}: ${err?.error?.message || e.message}`);
  }
  const text = response.text;
  if (typeof text !== 'string') throw new Error('Gemini returned no text.');
  return text;
}
