const translate = require('google-translate-api-free');

class Translator {
  constructor() {
    this.supportedLanguages = ['he', 'en', 'ru'];
  }

  async translateText(text, from, to) {
    if (!this.supportedLanguages.includes(from) || !this.supportedLanguages.includes(to)) {
      throw new Error('Unsupported language combination');
    }

    try {
      const result = await translate(text, { from, to });
      return result.text;
    } catch (error) {
      throw new Error(`Translation failed: ${error.message}`);
    }
  }

  async translateDocument(blocks, targetLang) {
    const translatedBlocks = [];

    for (const block of blocks) {
      if (block.type === 'text') {
        const translatedText = await this.translateText(block.content, block.language, targetLang);
        translatedBlocks.push({
          ...block,
          content: translatedText,
          originalContent: block.content
        });
      } else {
        translatedBlocks.push(block);
      }
    }

    return translatedBlocks;
  }

  validateLanguage(lang) {
    return this.supportedLanguages.includes(lang);
  }
}

module.exports = Translator;