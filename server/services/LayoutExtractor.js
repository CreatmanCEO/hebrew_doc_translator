const { DocumentBlock } = require('../models/DocumentBlock');
const { LayoutInfo } = require('../models/LayoutInfo');

class LayoutExtractor {
  /**
   * Извлечение информации о layout из проанализированного документа
   * @param {LayoutInfo} layoutInfo - Информация о layout
   * @returns {Object} Структурированная информация о layout
   */
  extractLayout(layoutInfo) {
    return {
      structure: this.analyzeStructure(layoutInfo),
      hierarchy: this.buildHierarchy(layoutInfo.blocks),
      styles: this.extractStyles(layoutInfo.blocks),
      relationships: this.analyzeRelationships(layoutInfo.blocks)
    };
  }

  /**
   * Анализ структуры документа
   * @private
   */
  analyzeStructure(layoutInfo) {
    const structure = {
      pages: [{
        size: layoutInfo.pageSize,
        margins: layoutInfo.margins,
        orientation: layoutInfo.orientation,
        columns: layoutInfo.columns,
        sections: this.analyzeSections(layoutInfo.blocks)
      }]
    };

    return structure;
  }

  /**
   * Анализ секций документа
   * @private
   */
  analyzeSections(blocks) {
    const sections = [];
    let currentSection = null;

    blocks.forEach(block => {
      if (block.type === 'heading') {
        if (currentSection) {
          sections.push(currentSection);
        }
        currentSection = {
          title: block,
          content: []
        };
      } else if (currentSection) {
        currentSection.content.push(block);
      }
    });

    if (currentSection) {
      sections.push(currentSection);
    }

    return sections;
  }

  /**
   * Построение иерархии документа
   * @private
   */
  buildHierarchy(blocks) {
    const hierarchy = [];
    const stack = [];

    blocks.forEach(block => {
      const level = this.getBlockLevel(block);

      while (stack.length > 0 && stack[stack.length - 1].level >= level) {
        stack.pop();
      }

      const node = {
        block,
        level,
        children: []
      };

      if (stack.length > 0) {
        stack[stack.length - 1].children.push(node);
      } else {
        hierarchy.push(node);
      }

      if (block.type === 'heading' || block.type === 'bullet' || block.type === 'numbered') {
        stack.push(node);
      }
    });

    return hierarchy;
  }

  /**
   * Получение уровня блока в иерархии
   * @private
   */
  getBlockLevel(block) {
    if (block.style.size > 16) return 1;
    if (block.style.size > 14) return 2;
    if (block.style.size > 12) return 3;
    return 4;
  }

  /**
   * Извлечение стилей из блоков
   * @private
   */
  extractStyles(blocks) {
    const styles = new Map();

    blocks.forEach(block => {
      const styleKey = this.generateStyleKey(block.style);
      if (!styles.has(styleKey)) {
        styles.set(styleKey, {
          count: 0,
          style: block.style,
          samples: []
        });
      }

      const styleInfo = styles.get(styleKey);
      styleInfo.count++;
      if (styleInfo.samples.length < 3) {
        styleInfo.samples.push(block.text);
      }
    });

    return Array.from(styles.entries()).map(([key, info]) => ({
      key,
      ...info
    }));
  }

  /**
   * Генерация ключа стиля
   * @private
   */
  generateStyleKey(style) {
    return `${style.font}_${style.size}_${style.color}_${style.alignment}`;
  }

  /**
   * Анализ взаимосвязей между блоками
   * @private
   */
  analyzeRelationships(blocks) {
    const relationships = [];

    for (let i = 0; i < blocks.length - 1; i++) {
      const current = blocks[i];
      const next = blocks[i + 1];

      relationships.push({
        from: current.id,
        to: next.id,
        type: this.determineRelationshipType(current, next),
        distance: current.distanceTo(next)
      });
    }

    return relationships;
  }

  /**
   * Определение типа связи между блоками
   * @private
   */
  determineRelationshipType(block1, block2) {
    if (Math.abs(block1.position.y - block2.position.y) < 5) {
      return 'horizontal';
    }
    if (Math.abs(block1.position.x - block2.position.x) < 5) {
      return 'vertical';
    }
    return 'diagonal';
  }
}

module.exports = LayoutExtractor;