/**
 * LiteLLM Proxy AI Provider
 *
 * Talks to a LiteLLM proxy (OpenAI-compatible /chat/completions) which routes
 * the `translate` alias to Claude (via OpenRouter) with a Gemini fallback, and
 * the `detect` alias to a lightweight model. The proxy hides provider details
 * behind stable model aliases.
 */

const { AIProvider } = require('../../core/translation/interfaces');

class LiteLLMProvider extends AIProvider {
  constructor(options = {}) {
    super();
    this.baseURL = options.baseURL || process.env.LITELLM_BASE_URL || 'http://litellm:4000';
    this.apiKey = options.apiKey || process.env.LITELLM_MASTER_KEY;
    this.model = options.model || 'translate';
    this.timeout = options.timeout || 30000;
  }

  /**
   * Build the auth/content headers, omitting Authorization when no key is set.
   * @private
   */
  buildHeaders() {
    const headers = { 'Content-Type': 'application/json' };
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }
    return headers;
  }

  /**
   * Build system prompt for translation
   * @private
   */
  buildSystemPrompt(from, to) {
    const langNames = {
      he: 'Hebrew',
      en: 'English',
      ru: 'Russian',
      ar: 'Arabic'
    };

    return `You are a professional translator specializing in ${langNames[from]} to ${langNames[to]} translation.

RULES:
1. Translate ONLY the text content
2. Preserve ALL formatting (line breaks, bullet points, numbering, indentation)
3. Keep numbers, dates, currency symbols, and special characters UNCHANGED
4. Maintain technical terms accurately
5. Do NOT add explanations or notes
6. Return ONLY the translated text

If text contains mixed languages, translate only the ${langNames[from]} parts.`;
  }

  /**
   * Translate text via the LiteLLM proxy.
   * @param {string} text
   * @param {string} from
   * @param {string} to
   * @returns {Promise<string>}
   */
  async translate(text, from, to) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(`${this.baseURL}/chat/completions`, {
        method: 'POST',
        headers: this.buildHeaders(),
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: 'system', content: this.buildSystemPrompt(from, to) },
            { role: 'user', content: text }
          ],
          temperature: 0,
          max_tokens: Math.min(text.length * 3, 4000)
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`LiteLLM API error: ${response.status} - ${error}`);
      }

      const data = await response.json();

      if (!data.choices?.[0]?.message?.content) {
        throw new Error('Invalid response from LiteLLM');
      }

      return data.choices[0].message.content.trim();
    } catch (error) {
      clearTimeout(timeoutId);

      if (error.name === 'AbortError') {
        throw new Error('Translation request timed out');
      }
      throw error;
    }
  }

  /**
   * Build the system prompt for batch translation + word alignment.
   * @private
   */
  buildBatchSystemPrompt(from, to) {
    const langNames = { he: 'Hebrew', en: 'English', ru: 'Russian', ar: 'Arabic' };
    const fromName = langNames[from] || from;
    const toName = langNames[to] || to;

    return `You are a professional translator ${fromName}->${toName}. ` +
      `You are given an array of segments, each with an id and its source word tokens (0-indexed). ` +
      `Return ONLY a JSON object {"items":[{"id":"...","target":"...","align":[{"src":[i],"tgt":[j]}]}]} ` +
      `where target is the translation and align maps source token indices to target token indices ` +
      `(target tokens = target split on spaces, 0-indexed). Preserve numbers/dates. Return one item per input id.`;
  }

  /**
   * Strip ```json ... ``` (or plain ``` ... ```) fences from a string.
   * @private
   */
  stripFences(content) {
    let s = String(content).trim();
    if (s.startsWith('```')) {
      // remove opening fence (with optional language tag) and trailing fence
      s = s.replace(/^```[a-zA-Z]*\s*\n?/, '').replace(/\n?```\s*$/, '').trim();
    }
    return s;
  }

  /**
   * Translate many segments in ONE call and return per-segment word alignments,
   * plus token usage / cost / the actual model used (differs from alias on fallback).
   *
   * @param {Array<{id:string, source:string, srcTokens:string[]}>} segments
   * @param {string} from
   * @param {string} to
   * @returns {Promise<{items:Array<{id:string,target:string,align:any[]}>, usage:object}>}
   */
  async translateBatchAligned(segments, from, to) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    let response;
    try {
      const userPayload = (segments || []).map((s) => ({
        id: s.id,
        source: s.source,
        srcTokens: s.srcTokens
      }));

      response = await fetch(`${this.baseURL}/chat/completions`, {
        method: 'POST',
        headers: this.buildHeaders(),
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: 'system', content: this.buildBatchSystemPrompt(from, to) },
            { role: 'user', content: JSON.stringify(userPayload) }
          ],
          temperature: 0,
          response_format: { type: 'json_object' }
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`LiteLLM API error: ${response.status} - ${error}`);
      }
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error('Batch translation request timed out');
      }
      throw error;
    }

    const data = await response.json();

    const headerCost = response.headers?.get
      ? response.headers.get('x-litellm-response-cost')
      : null;

    const usage = {
      model: data.model || this.model,
      promptTokens: data.usage?.prompt_tokens || 0,
      completionTokens: data.usage?.completion_tokens || 0,
      totalTokens: data.usage?.total_tokens || 0,
      costUsd: Number(headerCost ?? data._hidden_params?.response_cost ?? 0) || 0
    };

    // Parse the model's JSON content defensively. A 200 with junk content must
    // NOT crash the job — return empty items and let the caller proceed.
    let items = [];
    try {
      const content = data.choices?.[0]?.message?.content;
      if (typeof content === 'string') {
        const parsed = JSON.parse(this.stripFences(content));
        const arr = Array.isArray(parsed) ? parsed : parsed?.items;
        if (Array.isArray(arr)) {
          items = arr
            .filter((it) => it && typeof it.id === 'string' && typeof it.target === 'string')
            .map((it) => ({
              id: it.id,
              target: it.target,
              align: Array.isArray(it.align) ? it.align : []
            }));
        }
      }
    } catch {
      items = [];
    }

    return { items, usage };
  }

  /**
   * Detect language via the LiteLLM `detect` alias.
   * @param {string} text
   * @returns {Promise<string|null>}
   */
  async detectLanguage(text) {
    try {
      const response = await fetch(`${this.baseURL}/chat/completions`, {
        method: 'POST',
        headers: this.buildHeaders(),
        body: JSON.stringify({
          model: 'detect',
          messages: [
            {
              role: 'system',
              content: 'Detect the language of the text. Reply with ONLY the ISO 639-1 code (he, en, ru, ar). If unsure, reply "unknown".'
            },
            { role: 'user', content: text.substring(0, 500) }
          ],
          temperature: 0,
          max_tokens: 10
        })
      });

      if (!response.ok) {
        return null;
      }

      const data = await response.json();
      const detected = data.choices?.[0]?.message?.content?.trim().toLowerCase();

      const validCodes = ['he', 'en', 'ru', 'ar'];
      return validCodes.includes(detected) ? detected : null;
    } catch {
      return null;
    }
  }

  /**
   * Health check against the proxy's /health endpoint.
   * @returns {Promise<boolean>}
   */
  async healthCheck() {
    try {
      const response = await fetch(`${this.baseURL}/health`, {
        headers: this.buildHeaders()
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Set model alias.
   * @param {string} model
   */
  setModel(model) {
    this.model = model;
  }
}

module.exports = LiteLLMProvider;
