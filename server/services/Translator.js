const { default: translate } = require('@vitalets/google-translate-api');
const { DocumentBlock } = require('../models/DocumentBlock');

class Translator {
  constructor() {
    this.translationCache = new Map();
    this.batchSize = 10;
    this.retryAttempts = 3;
    this.retryDelay = 1000;
  }

  async translateBlocks(blocks, targetLang) {
    const processedBlocks = [];
    const batchesGroups = this.groupBlocksByType(blocks);

    for (const [type, typeBlocks] of Object.entries(batchesGroups)) {
      const translatedTypeBlocks = await this.processBlocksByType(typeBlocks, targetLang, type);
      processedBlocks.push(...translatedTypeBlocks);
    }

    return processedBlocks.sort((a, b) => {
      const aIndex = blocks.findIndex(block => block.id === a.id);
      const bIndex = blocks.findIndex(block => block.id === b.id);
      return aIndex - bIndex;
    });
  }

  groupBlocksByType(blocks) {
    return blocks.reduce((groups, block) => {
      if (block.isImage()) {
        groups.images = groups.images || [];
        groups.images.push(block);
      } else if (block.requiresTranslation()) {
        groups.translate = groups.translate || [];
        groups.translate.push(block);
      } else {
        groups.keep = groups.keep || [];
        groups.keep.push(block);
      }
      return groups;
    }, {});
  }

  async processBlocksByType(blocks, targetLang, type) {
    switch (type) {
      case 'translate':
        return await this.translateBatches(blocks, targetLang);
      case 'images':
      case 'keep':
        return blocks;
      default:
        console.warn('Unknown block type:', type);
        return blocks;
    }
  }

  async translateBatches(blocks, targetLang) {
    const translatedBlocks = [];
    
    for (let i = 0; i < blocks.length; i += this.batchSize) {
      const batch = blocks.slice(i, i + this.batchSize);
      const translatedBatch = await this.translateBatchWithRetry(batch, targetLang);
      translatedBlocks.push(...translatedBatch);
    }

    return translatedBlocks;
  }

  async translateBatchWithRetry(batch, targetLang) {
    for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
      try {
        return await this.translateBatch(batch, targetLang);
      } catch (error) {
        if (attempt === this.retryAttempts) {
          console.error('Translation failed after all attempts:', error);
          return batch;
        }
        await this.delay(this.retryDelay * attempt);
      }
    }
  }

  async translateBatch(batch, targetLang) {
    const translations = await Promise.all(
      batch.map(block => this.translateBlock(block, targetLang))
    );

    return translations.map((translatedBlock, index) => 
      this.preserveFormatting(translatedBlock, batch[index])
    );
  }

  async translateBlock(block, targetLang) {
    try {
      const cacheKey = `${block.text}:${targetLang}`;
      if (this.translationCache.has(cacheKey)) {
        const translatedText = this.translationCache.get(cacheKey);
        return block.updateText(translatedText);
      }

      const preparedText = this.prepareForTranslation(block.text);
      
      const { text: translatedText } = await translate(preparedText, {
        from: 'iw',
        to: targetLang
      });

      const processedTranslation = this.postProcessTranslation(
        translatedText,
        block.type,
        block.language,
        targetLang
      );

      this.translationCache.set(cacheKey, processedTranslation);

      return new DocumentBlock({
        ...block,
        text: processedTranslation,
        language: targetLang
      });
    } catch (error) {
      console.error('Translation failed for block', block.id, ':', error);
      return block;
    }
  }

  prepareForTranslation(text) {
    let prepared = text
      .replace(/\n/g, '[NEWLINE]')
      .replace(/\t/g, '[TAB]')
      .replace(/\s+/g, ' ')
      .trim();

    prepared = prepared.replace(/(\d+)/g, match => `[NUM]${match}[/NUM]`);
    
    prepared = prepared.replace(/(<[^>]+>)/g, match => `[TAG]${match}[/TAG]`);

    return prepared;
  }

  postProcessTranslation(text, blockType, sourceLang, targetLang) {
    let processed = text
      .replace(/\[NEWLINE\]/g, '\n')
      .replace(/\[TAB\]/g, '\t')
      .replace(/\[NUM\](\d+)\[\/NUM\]/g, '$1')
      .replace(/\[TAG\](.+?)\[\/TAG\]/g, '$1');

    switch (blockType) {
      case 'heading':
        processed = this.capitalizeFirst(processed);
        break;
      case 'bullet':
        if (!processed.startsWith('•')) {
          processed = `• ${processed}`;
        }
        break;
      case 'numbered':
        if (!/^\d+\./.test(processed)) {
          const number = text.match(/^(\d+)\./)?.[1] || '1';
          processed = `${number}. ${processed}`;
        }
        break;
    }

    return processed;
  }

  capitalizeFirst(text) {
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  clearCache() {
    this.translationCache.clear();
  }

  getCacheSize() {
    return this.translationCache.size;
  }
}

module.exports = Translator;