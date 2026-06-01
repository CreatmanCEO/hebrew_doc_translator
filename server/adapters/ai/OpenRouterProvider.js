/**
 * OpenRouter AI Provider
 * Supports Claude, GPT, Llama, Mistral via unified API
 */

const { AIProvider } = require('../../core/translation/interfaces');

class OpenRouterProvider extends AIProvider {
  constructor(options = {}) {
    super();
    this.apiKey = options.apiKey || process.env.OPENROUTER_API_KEY;
    this.model = options.model || 'anthropic/claude-3-haiku';
    this.baseURL = 'https://openrouter.ai/api/v1';
    this.appName = options.appName || 'Hebrew Document Translator';
    this.timeout = options.timeout || 30000;
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
   * Translate text using OpenRouter API
   * @param {string} text
   * @param {string} from
   * @param {string} to
   * @returns {Promise<string>}
   */
  async translate(text, from, to) {
    if (!this.apiKey) {
      throw new Error('OpenRouter API key not configured');
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(`${this.baseURL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
          'HTTP-Referer': 'https://hebrew-doc-translator.app',
          'X-Title': this.appName
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: 'system', content: this.buildSystemPrompt(from, to) },
            { role: 'user', content: text }
          ],
          temperature: 0.3,
          max_tokens: Math.min(text.length * 3, 4000)
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`OpenRouter API error: ${response.status} - ${error}`);
      }

      const data = await response.json();

      if (!data.choices?.[0]?.message?.content) {
        throw new Error('Invalid response from OpenRouter');
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
   * Detect language using AI
   * @param {string} text
   * @returns {Promise<string|null>}
   */
  async detectLanguage(text) {
    if (!this.apiKey) {
      return null;
    }

    try {
      const response = await fetch(`${this.baseURL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
          'HTTP-Referer': 'https://hebrew-doc-translator.app',
          'X-Title': this.appName
        },
        body: JSON.stringify({
          model: this.model,
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
   * Health check
   * @returns {Promise<boolean>}
   */
  async healthCheck() {
    if (!this.apiKey) {
      return false;
    }

    try {
      const response = await fetch(`${this.baseURL}/models`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`
        }
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Get available models
   * @returns {Promise<string[]>}
   */
  async getModels() {
    try {
      const response = await fetch(`${this.baseURL}/models`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`
        }
      });
      const data = await response.json();
      return data.data?.map(m => m.id) || [];
    } catch {
      return [];
    }
  }

  /**
   * Set model
   * @param {string} model
   */
  setModel(model) {
    this.model = model;
  }
}

module.exports = OpenRouterProvider;
