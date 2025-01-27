class DocumentBlock {
  constructor(type, content, style = {}) {
    this.type = type;
    this.content = content;
    this.style = style;
  }
}

class LayoutInfo {
  constructor() {
    this.blocks = [];
    this.styles = new Map();
    this.metadata = {};
  }

  addBlock(block) {
    this.blocks.push(block);
  }

  addStyle(selector, style) {
    this.styles.set(selector, style);
  }

  setMetadata(key, value) {
    this.metadata[key] = value;
  }
}

class LayoutExtractor {
  constructor() {
    this.currentLayout = new LayoutInfo();
  }

  async extractLayout(document) {
    try {
      const blocks = await this.parseDocument(document);
      return new DocumentBlock('root', blocks);
    } catch (error) {
      throw new Error(`Layout extraction failed: ${error.message}`);
    }
  }

  async parseDocument(document) {
    const blocks = [];
    const processedContent = await this._preprocessContent(document);

    for (const section of processedContent) {
      const block = new DocumentBlock(
        section.type,
        section.content,
        this._extractStyle(section)
      );
      blocks.push(block);
    }

    return blocks;
  }

  _extractStyle(section) {
    const defaultStyle = {
      font: section.font || 'Arial',
      fontSize: section.fontSize || 12,
      alignment: section.alignment || 'left',
      direction: this._detectTextDirection(section.content)
    };

    return {
      ...defaultStyle,
      ...section.style
    };
  }

  _detectTextDirection(text) {
    // Простая проверка на наличие иврита в тексте
    const hebrewPattern = /[\u0590-\u05FF]/;
    return hebrewPattern.test(text) ? 'rtl' : 'ltr';
  }

  async _preprocessContent(document) {
    // Заглушка для демонстрации структуры
    return [{
      type: 'text',
      content: document.toString(),
      font: 'Arial',
      fontSize: 12,
      alignment: 'left'
    }];
  }

  getStyles() {
    return this.currentLayout.styles;
  }

  getMetadata() {
    return this.currentLayout.metadata;
  }
}

module.exports = {
  LayoutExtractor,
  LayoutInfo,
  DocumentBlock
};