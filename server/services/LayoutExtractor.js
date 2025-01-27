class LayoutExtractor {
  constructor() {
    this.defaultMargins = { top: 72, right: 72, bottom: 72, left: 72 };
  }

  extractLayout(blocks, pageSize) {
    return new LayoutInfo({
      pageSize: pageSize || { width: 595, height: 842 },
      margins: this.detectMargins(blocks),
      orientation: this.detectOrientation(pageSize),
      columns: this.detectColumns(blocks),
      blocks: blocks.map(block => new DocumentBlock(block))
    });
  }

  detectMargins(blocks) {
    if (!blocks.length) {
      return this.defaultMargins;
    }

    const top = Math.min(...blocks.map(b => b.position.y));
    const left = Math.min(...blocks.map(b => b.position.x));
    const right = Math.min(...blocks.map(b => b.position.x + b.position.width));
    const bottom = Math.min(...blocks.map(b => b.position.y + b.position.height));

    return { top, right, bottom, left };
  }

  detectOrientation(pageSize) {
    if (!pageSize) return 'portrait';
    return pageSize.width > pageSize.height ? 'landscape' : 'portrait';
  }

  detectColumns(blocks) {
    const xPositions = blocks
      .map(b => b.position.x)
      .sort((a, b) => a - b);

    const columns = [];
    let currentX = xPositions[0];
    const minGap = 50;

    for (let i = 1; i < xPositions.length; i++) {
      if (xPositions[i] - currentX > minGap) {
        columns.push({
          x: currentX,
          width: xPositions[i] - currentX - 10
        });
        currentX = xPositions[i];
      }
    }

    return columns;
  }
}

module.exports = LayoutExtractor;