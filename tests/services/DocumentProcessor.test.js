const DocumentProcessor = require('../../server/documentProcessor');
const path = require('path');
const fs = require('fs').promises;

jest.mock('pdf.js-extract');
jest.mock('mammoth');
jest.mock('../../server/services/Translator');
jest.mock('franc');

describe('DocumentProcessor', () => {
  let processor;
  let mockPdfData;
  let mockDocxData;

  beforeEach(() => {
    processor = new DocumentProcessor();
    
    // Мокаем данные PDF
    mockPdfData = {
      meta: { title: 'Test PDF' },
      pages: [{
        pageInfo: { num: 1, width: 595, height: 842 },
        content: [
          { str: 'שלום', x: 10, y: 10, fontSize: 12, fontFamily: 'Arial' },
          { str: 'Hello', x: 100, y: 10, fontSize: 12, fontFamily: 'Arial' },
          { str: 'עולם', x: 10, y: 30, fontSize: 14, fontFamily: 'Arial' }
        ]
      }]
    };

    // Мокаем данные DOCX
    mockDocxData = {
      value: 'שלום\n\nHello\n\nעולם',
      metadata: { title: 'Test DOCX' }
    };

    // Мокаем извлечение PDF
    processor.pdfExtractor.extract = jest.fn().mockResolvedValue(mockPdfData);

    // Мокаем извлечение DOCX
    require('mammoth').extractRawText = jest.fn().mockResolvedValue(mockDocxData);

    // Мокаем определение языка
    require('franc').mockImplementation((text) => {
      if (text.match(/[\u0590-\u05FF]/)) return 'he';
      return 'en';
    });

    // Мокаем перевод
    processor.translator.translateDocument = jest.fn().mockImplementation(blocks => 
      blocks.map(block => ({
        ...block,
        content: block.needsTranslation ? 'Translated: ' + block.content : block.content
      }))
    );
  });

  describe('PDF Processing', () => {
    it('should process PDF file and maintain formatting', async () => {
      const result = await processor.processPdf('test.pdf', 'ru');

      expect(result.type).toBe('pdf');
      expect(result.pages).toHaveLength(1);
      expect(result.pages[0].blocks).toHaveLength(2); // Объединенные блоки на одной строке
      
      // Проверяем сохранение стилей
      const firstBlock = result.pages[0].blocks[0];
      expect(firstBlock.style).toMatchObject({
        fontSize: 12,
        fontFamily: 'Arial'
      });
    });

    it('should detect text that needs translation', async () => {
      const result = await processor.processPdf('test.pdf', 'ru');
      
      const hebrewBlock = result.pages[0].blocks.find(b => b.content.includes('שלום'));
      expect(hebrewBlock.needsTranslation).toBe(true);
      
      const englishBlock = result.pages[0].blocks.find(b => b.content.includes('Hello'));
      expect(englishBlock.needsTranslation).toBe(true);
    });
  });

  describe('DOCX Processing', () => {
    it('should process DOCX file and detect text direction', async () => {
      const result = await processor.processDocx('test.docx', 'ru');

      expect(result.type).toBe('docx');
      expect(result.content).toHaveLength(3); // 3 параграфа
      
      // Проверяем определение направления текста
      const hebrewBlock = result.content.find(b => b.content.includes('שלום'));
      expect(hebrewBlock.style.direction).toBe('rtl');
      
      const englishBlock = result.content.find(b => b.content.includes('Hello'));
      expect(englishBlock.style.direction).toBe('ltr');
    });

    it('should preserve metadata', async () => {
      const result = await processor.processDocx('test.docx', 'ru');
      expect(result.metadata).toEqual({ title: 'Test DOCX' });
    });
  });

  describe('Language Detection', () => {
    it('should correctly detect Hebrew text', () => {
      expect(processor.detectLanguage('שלום עולם')).toBe('he');
    });

    it('should correctly detect English text', () => {
      expect(processor.detectLanguage('Hello World')).toBe('en');
    });

    it('should handle empty or invalid input', () => {
      expect(processor.detectLanguage('')).toBeNull();
      expect(processor.detectLanguage(null)).toBeNull();
      expect(processor.detectLanguage('123')).toBeNull();
    });
  });

  describe('Error Handling', () => {
    it('should handle PDF processing errors', async () => {
      processor.pdfExtractor.extract.mockRejectedValueOnce(new Error('PDF Error'));
      
      await expect(processor.processPdf('test.pdf', 'ru'))
        .rejects
        .toThrow('PDF processing failed: PDF Error');
    });

    it('should handle DOCX processing errors', async () => {
      require('mammoth').extractRawText.mockRejectedValueOnce(new Error('DOCX Error'));
      
      await expect(processor.processDocx('test.docx', 'ru'))
        .rejects
        .toThrow('DOCX processing failed: DOCX Error');
    });

    it('should handle unsupported file formats', async () => {
      await expect(processor.processDocument('test.txt', 'ru'))
        .rejects
        .toThrow('Unsupported file format');
    });

    it('should handle unsupported target languages', async () => {
      await expect(processor.processDocument('test.pdf', 'fr'))
        .rejects
        .toThrow('Unsupported target language');
    });
  });

  describe('Table Processing in PDF', () => {
    beforeEach(() => {
      mockPdfData = {
        meta: { title: 'Test PDF with Table' },
        pages: [{
          pageInfo: { num: 1, width: 595, height: 842 },
          content: [
            // Заголовок таблицы
            { str: 'שם', x: 10, y: 10, fontSize: 12, fontFamily: 'Arial' },
            { str: 'גיל', x: 100, y: 10, fontSize: 12, fontFamily: 'Arial' },
            { str: 'עיר', x: 190, y: 10, fontSize: 12, fontFamily: 'Arial' },
            // Первая строка
            { str: 'דוד', x: 10, y: 30, fontSize: 12, fontFamily: 'Arial' },
            { str: '25', x: 100, y: 30, fontSize: 12, fontFamily: 'Arial' },
            { str: 'תל אביב', x: 190, y: 30, fontSize: 12, fontFamily: 'Arial' },
            // Вторая строка
            { str: 'שרה', x: 10, y: 50, fontSize: 12, fontFamily: 'Arial' },
            { str: '30', x: 100, y: 50, fontSize: 12, fontFamily: 'Arial' },
            { str: 'ירושלים', x: 190, y: 50, fontSize: 12, fontFamily: 'Arial' },
            // Обычный текст после таблицы
            { str: 'סיכום:', x: 10, y: 100, fontSize: 14, fontFamily: 'Arial' }
          ]
        }]
      };
    });

    it('should detect and process tables in PDF', async () => {
      const result = await processor.processPdf('test.pdf', 'ru');
      
      // Проверяем, что таблица была обнаружена
      const table = result.pages[0].blocks.find(b => b.type === 'table');
      expect(table).toBeDefined();
      expect(table.rows).toHaveLength(3); // Заголовок + 2 строки
      
      // Проверяем структуру таблицы
      expect(table.rows[0]).toHaveLength(3); // 3 колонки
      expect(table.rows[0][0].content).toBe('שם');
      expect(table.rows[1][0].content).toBe('דוד');
    });

    it('should preserve table formatting in PDF', async () => {
      const result = await processor.processPdf('test.pdf', 'ru');
      const table = result.pages[0].blocks.find(b => b.type === 'table');
      
      // Проверяем сохранение стилей ячеек
      expect(table.rows[0][0].style).toMatchObject({
        fontSize: 12,
        fontFamily: 'Arial'
      });
      
      // Проверяем позиционирование
      expect(table.style).toMatchObject({
        x: 10,
        width: expect.any(Number),
        height: expect.any(Number)
      });
    });
  });

  describe('Table Processing in DOCX', () => {
    beforeEach(() => {
      mockDocxData = {
        value: `
<table>
<table-row>
<table-cell>שם</table-cell>
<table-cell>גיל</table-cell>
<table-cell>עיר</table-cell>
</table-row>
<table-row>
<table-cell>דוד</table-cell>
<table-cell>25</table-cell>
<table-cell>תל אביב</table-cell>
</table-row>
<table-row>
<table-cell>שרה</table-cell>
<table-cell>30</table-cell>
<table-cell>ירושלים</table-cell>
</table-row>
</table>

סיכום:
`,
        metadata: { title: 'Test DOCX with Table' }
      };
    });

    it('should detect and process tables in DOCX', async () => {
      const result = await processor.processDocx('test.docx', 'ru');
      
      // Проверяем, что таблица была обнаружена
      const table = result.content.find(b => b.type === 'table');
      expect(table).toBeDefined();
      expect(table.rows).toHaveLength(3);
      
      // Проверяем содержимое таблицы
      expect(table.rows[0][0].content).toBe('שם');
      expect(table.rows[1][0].content).toBe('דוד');
    });

    it('should handle mixed content in DOCX tables', async () => {
      mockDocxData.value = `
<table>
<table-row>
<table-cell>Name</table-cell>
<table-cell>שם</table-cell>
</table-row>
<table-row>
<table-cell>Age</table-cell>
<table-cell>גיל</table-cell>
</table-row>
</table>
`;
      
      const result = await processor.processDocx('test.docx', 'ru');
      const table = result.content.find(b => b.type === 'table');
      
      // Проверяем определение языка в ячейках
      expect(table.rows[0][0].style.direction).toBe('ltr');
      expect(table.rows[0][1].style.direction).toBe('rtl');
      
      // Проверяем флаги перевода
      expect(table.rows[0][0].needsTranslation).toBe(true); // английский текст
      expect(table.rows[0][1].needsTranslation).toBe(true); // ивритский текст
    });

    it('should preserve table structure after translation', async () => {
      const result = await processor.processDocx('test.docx', 'ru');
      const table = result.content.find(b => b.type === 'table');
      
      // Проверяем, что структура таблицы сохранилась
      expect(table.rows).toHaveLength(3);
      table.rows.forEach(row => {
        expect(row).toHaveLength(3);
        row.forEach(cell => {
          expect(cell).toHaveProperty('content');
          expect(cell).toHaveProperty('style');
          expect(cell).toHaveProperty('needsTranslation');
        });
      });
    });
  });
}); 