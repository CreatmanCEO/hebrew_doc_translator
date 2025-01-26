const translate = require('google-translate-api-free');
const { DocumentBlock } = require('../models/DocumentBlock');

class Translator {
  constructor() {
    this.translationCache = new Map();
    this.batchSize = 10; // Размер пакета для одновременного перевода
    this.retryAttempts = 3; // Количество попыток перевода при ошибке
    this.retryDelay = 1000; // Задержка между попытками в миллисекундах
  }

  /**
   * Перевод блоков документа
   * @param {Array<DocumentBlock>} blocks - Массив блоков документа
   * @param {string} targetLang - Целевой язык перевода
   * @returns {Promise<Array<DocumentBlock>>} Обработанные блоки
   */
  async translateBlocks(blocks, targetLang) {
    const processedBlocks = [];
    const batchesGroups = this.groupBlocksByType(blocks);

    for (const [type, typeBlocks] of Object.entries(batchesGroups)) {
      const translatedTypeBlocks = await this.processBlocksByType(typeBlocks, targetLang, type);
      processedBlocks.push(...translatedTypeBlocks);
    }

    // Сортируем блоки по их исходному порядку
    return processedBlocks.sort((a, b) => {
      const aIndex = blocks.findIndex(block => block.id === a.id);
      const bIndex = blocks.findIndex(block => block.id === b.id);
      return aIndex - bIndex;
    });
  }

  /**
   * Группировка блоков по типу
   * @private
   */
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

  /**
   * Обработка блоков определенного типа
   * @private
   */
  async processBlocksByType(blocks, targetLang, type) {
    switch (type) {
      case 'translate':
        return await this.translateBatches(blocks, targetLang);
      case 'images':
      case 'keep':
        return blocks; // Возвращаем без изменений
      default:
        console.warn(\`Unknown block type: \${type}\`);
        return blocks;
    }
  }

  /**
   * Перевод блоков пакетами
   * @private
   */
  async translateBatches(blocks, targetLang) {
    const translatedBlocks = [];
    
    for (let i = 0; i < blocks.length; i += this.batchSize) {
      const batch = blocks.slice(i, i + this.batchSize);
      const translatedBatch = await this.translateBatchWithRetry(batch, targetLang);
      translatedBlocks.push(...translatedBatch);
    }

    return translatedBlocks;
  }

  /**
   * Перевод пакета с повторными попытками
   * @private
   */
  async translateBatchWithRetry(batch, targetLang) {
    for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
      try {
        return await this.translateBatch(batch, targetLang);
      } catch (error) {
        if (attempt === this.retryAttempts) {
          console.error('Translation failed after all attempts:', error);
          return batch; // Возвращаем оригинальные блоки
        }
        await this.delay(this.retryDelay * attempt);
      }
    }
  }

  /**
   * Перевод пакета блоков
   * @private
   */
  async translateBatch(batch, targetLang) {
    const translations = await Promise.all(
      batch.map(block => this.translateBlock(block, targetLang))
    );

    // Проверяем и корректируем форматирование после перевода
    return translations.map((translatedBlock, index) => 
      this.preserveFormatting(translatedBlock, batch[index])
    );
  }

  /**
   * Перевод отдельного блока
   * @private
   */
  async translateBlock(block, targetLang) {
    try {
      // Проверяем кэш
      const cacheKey = \`\${block.text}:\${targetLang}\`;
      if (this.translationCache.has(cacheKey)) {
        const translatedText = this.translationCache.get(cacheKey);
        return block.updateText(translatedText);
      }

      // Подготовка текста к переводу
      let preparedText = this.prepareForTranslation(block);
      
      // Перевод
      const { text: translatedText } = await translate(preparedText, {
        from: block.language,
        to: targetLang
      });

      // Постобработка перевода
      const processedTranslation = this.postProcessTranslation(
        translatedText,
        block.type,
        block.language,
        targetLang
      );

      // Сохраняем в кэш
      this.translationCache.set(cacheKey, processedTranslation);

      // Создаем новый блок с переведенным текстом
      return new DocumentBlock({
        ...block,
        text: processedTranslation,
        language: targetLang
      });
    } catch (error) {
      console.error(\`Translation failed for block \${block.id}:\`, error);
      return block; // Возвращаем оригинальный блок
    }
  }

  /**
   * Подготовка блока к переводу
   * @private
   */
  prepareForTranslation(block) {
    // Сохраняем специальные символы и форматирование
    let text = block.text
      .replace(/\\n/g, '[NEWLINE]')
      .replace(/\\t/g, '[TAB]')
      .replace(/\\s+/g, ' ')
      .trim();

    // Сохраняем числа и специальные символы
    text = text.replace(/(\d+)/g, match => \`[NUM]\${match}[/NUM]\`);
    
    // Сохраняем HTML/XML теги
    text = text.replace(/(<[^>]+>)/g, match => \`[TAG]\${match}[/TAG]\`);

    // Сохраняем маркеры списков
    text = text.replace(/^((?:\\d+\\.|-|•)\\s)/g, match => \`[LIST]\${match}[/LIST]\`);

    return text;
  }

  /**
   * Постобработка переведенного текста
   * @private
   */
  postProcessTranslation(text, blockType, sourceLang, targetLang) {
    // Восстанавливаем специальные символы и форматирование
    let processed = text
      .replace(/\\[NEWLINE\\]/g, '\\n')
      .replace(/\\[TAB\\]/g, '\\t')
      .replace(/\\[NUM\\](\\d+)\\[\\/NUM\\]/g, '$1')
      .replace(/\\[TAG\\](.+?)\\[\\/TAG\\]/g, '$1')
      .replace(/\\[LIST\\](.+?)\\[\\/LIST\\]/g, '$1');

    // Обработка в зависимости от типа блока
    switch (blockType) {
      case 'heading':
        processed = this.capitalizeFirst(processed);
        break;
      case 'bullet':
        if (!processed.startsWith('•')) {
          processed = \`• \${processed}\`;
        }
        break;
      case 'numbered':
        if (!/^\\d+\\./.test(processed)) {
          const number = text.match(/^(\\d+)\\./)?.[1] || '1';
          processed = \`\${number}. \${processed}\`;
        }
        break;
    }

    // Корректировка направления текста
    processed = this.adjustTextDirection(processed, sourceLang, targetLang);

    return processed;
  }

  /**
   * Сохранение форматирования
   * @private
   */
  preserveFormatting(translatedBlock, originalBlock) {
    return new DocumentBlock({
      ...translatedBlock,
      position: originalBlock.position,
      style: originalBlock.style,
      metadata: {
        ...originalBlock.metadata,
        originalLanguage: originalBlock.language
      }
    });
  }

  /**
   * Корректировка направления текста
   * @private
   */
  adjustTextDirection(text, sourceLang, targetLang) {
    const rtlLangs = ['he', 'ar'];
    const isSourceRTL = rtlLangs.includes(sourceLang);
    const isTargetRTL = rtlLangs.includes(targetLang);

    if (isSourceRTL !== isTargetRTL) {
      // Добавляем/удаляем маркеры направления текста
      return isTargetRTL ? \`\\u202B\${text}\\u202C\` : text.replace(/[\\u202B\\u202C]/g, '');
    }

    return text;
  }

  /**
   * Задержка выполнения
   * @private
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Капитализация первой буквы
   * @private
   */
  capitalizeFirst(text) {
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  /**
   * Очистка кэша переводов
   */
  clearCache() {
    this.translationCache.clear();
  }

  /**
   * Получение размера кэша
   */
  getCacheSize() {
    return this.translationCache.size;
  }
}

module.exports = Translator;