class DocumentBlock {
  constructor({
    id,
    text,
    position,
    style,
    type,
    metadata,
    contentType = 'text',
    language = null,
    needsTranslation = false,
    imageData = null
  }) {
    this.id = id;                     // Уникальный идентификатор блока
    this.text = text;                 // Текст блока (если это текстовый блок)
    this.position = position;         // Позиция на странице {x, y, width, height}
    this.style = style;               // Стили {font, size, color, alignment, etc}
    this.type = type;                 // Тип блока (заголовок, параграф, список и т.д.)
    this.metadata = metadata;         // Дополнительные метаданные
    this.contentType = contentType;   // Тип содержимого ('text' или 'image')
    this.language = language;         // Язык блока ('he', 'en', etc.)
    this.needsTranslation = needsTranslation; // Нужен ли перевод
    this.imageData = imageData;       // Данные изображения (если это изображение)
  }

  // Клонирование блока
  clone() {
    return new DocumentBlock({
      id: this.id,
      text: this.text,
      position: { ...this.position },
      style: { ...this.style },
      type: this.type,
      metadata: { ...this.metadata },
      contentType: this.contentType,
      language: this.language,
      needsTranslation: this.needsTranslation,
      imageData: this.imageData
    });
  }

  // Обновление текста с сохранением форматирования
  updateText(newText) {
    return new DocumentBlock({
      ...this,
      text: newText
    });
  }

  // Обновление языка и флага перевода
  updateLanguage(lang) {
    this.language = lang;
    // Помечаем для перевода только текст на иврите
    this.needsTranslation = lang === 'he';
    return this;
  }

  // Проверка на изображение
  isImage() {
    return this.contentType === 'image';
  }

  // Проверка на текст
  isText() {
    return this.contentType === 'text';
  }

  // Проверка на иврит
  isHebrew() {
    return this.language === 'he';
  }

  // Проверка необходимости перевода
  requiresTranslation() {
    return this.isText() && this.needsTranslation;
  }

  // Проверка на перекрытие с другим блоком
  overlaps(other) {
    return !(
      this.position.x + this.position.width < other.position.x ||
      other.position.x + other.position.width < this.position.x ||
      this.position.y + this.position.height < other.position.y ||
      other.position.y + other.position.height < this.position.y
    );
  }

  // Расчет расстояния до другого блока
  distanceTo(other) {
    const dx = this.position.x - other.position.x;
    const dy = this.position.y - other.position.y;
    return Math.sqrt(dx * dx + dy * dy);
  }
}

module.exports = DocumentBlock;