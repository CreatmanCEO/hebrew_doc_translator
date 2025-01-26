class LayoutInfo {
  constructor({
    pageSize,
    margins,
    orientation,
    columns,
    blocks
  }) {
    this.pageSize = pageSize;        // Размер страницы {width, height}
    this.margins = margins;          // Отступы {top, right, bottom, left}
    this.orientation = orientation;   // Ориентация страницы
    this.columns = columns;          // Информация о колонках
    this.blocks = blocks;            // Массив DocumentBlock
  }

  // Добавление нового блока
  addBlock(block) {
    this.blocks.push(block);
  }

  // Получение всех блоков определенного типа
  getBlocksByType(type) {
    return this.blocks.filter(block => block.type === type);
  }

  // Получение блоков в заданной области
  getBlocksInArea(area) {
    return this.blocks.filter(block => 
      block.position.x >= area.x &&
      block.position.y >= area.y &&
      block.position.x + block.position.width <= area.x + area.width &&
      block.position.y + block.position.height <= area.y + area.height
    );
  }

  // Проверка на конфликты между блоками
  hasConflicts() {
    for (let i = 0; i < this.blocks.length; i++) {
      for (let j = i + 1; j < this.blocks.length; j++) {
        if (this.blocks[i].overlaps(this.blocks[j])) {
          return true;
        }
      }
    }
    return false;
  }

  // Получение ближайших блоков к заданному
  getNearestBlocks(block, count = 1) {
    return this.blocks
      .filter(b => b !== block)
      .sort((a, b) => 
        block.distanceTo(a) - block.distanceTo(b)
      )
      .slice(0, count);
  }

  // Клонирование layout
  clone() {
    return new LayoutInfo({
      pageSize: { ...this.pageSize },
      margins: { ...this.margins },
      orientation: this.orientation,
      columns: [ ...this.columns ],
      blocks: this.blocks.map(block => block.clone())
    });
  }
}

module.exports = LayoutInfo;