const { TranslationServiceClient } = require('@azure/ai-translator');

class Translator {
  constructor() {
    this.client = new TranslationServiceClient(process.env.AZURE_TRANSLATOR_KEY);
    this.supportedLanguages = ['he', 'en', 'ru'];
  }

  async translateText(text, from, to) {
    if (!this.supportedLanguages.includes(from) || !this.supportedLanguages.includes(to)) {
      throw new Error('Unsupported language combination');
    }

    try {
      const response = await this.client.translate({
        text,
        from,
        to,
      });

      return response.translation;
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