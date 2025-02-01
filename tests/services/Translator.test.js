const Translator = require('../../server/services/Translator');

describe('Translator Service', () => {
  describe('Basic Translation', () => {
    it('should translate text from Hebrew to English', async () => {
      const result = await Translator.translate('שלום', 'he', 'en');
      expect(result).toBe('Hello');
    });

    it('should translate text from Hebrew to Russian', async () => {
      const result = await Translator.translate('שלום', 'he', 'ru');
      expect(result).toBe('Привет');
    });

    it('should handle large text', async () => {
      const text = 'שלום'.repeat(100);
      const result = await Translator.translate(text, 'he', 'en');
      expect(result).toBe('Hello'.repeat(100));
    });
  });

  describe('Mixed Content Handling', () => {
    it('should preserve non-Hebrew parts', async () => {
      const result = await Translator.translate('Hello שלום World', 'he', 'en');
      expect(result).toBe('Hello Hello World');
    });

    it('should handle special characters and numbers', async () => {
      const result = await Translator.translate('123 !שלום? 456', 'he', 'en');
      expect(result).toBe('123 !Hello? 456');
    });
  });

  describe('Document Translation', () => {
    it('should translate document content', async () => {
      const doc = {
        content: 'שלום וברוכים הבאים',
        metadata: { title: 'Test' }
      };
      const result = await Translator.translateDocument(doc, 'he', 'en');
      expect(result.content).toBe('Hello and welcome');
      expect(result.metadata).toEqual(doc.metadata);
    });

    it('should handle empty document sections', async () => {
      const doc = {
        content: '',
        metadata: { title: 'Test' }
      };
      const result = await Translator.translateDocument(doc, 'he', 'en');
      expect(result.content).toBe('');
      expect(result.metadata).toEqual(doc.metadata);
    });
  });

  describe('Rate Limiting', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should handle rate limits', async () => {
      // Make multiple requests to trigger rate limit
      const promises = Array(10).fill().map(() => 
        Translator.translate('שלום', 'he', 'en')
      );
      
      await expect(Promise.all(promises))
        .rejects
        .toThrow('Rate limit exceeded');
    });

    it('should recover after rate limit cooldown', async () => {
      // First trigger rate limit
      const promises = Array(10).fill().map(() => 
        Translator.translate('שלום', 'he', 'en')
      );
      
      await expect(Promise.all(promises))
        .rejects
        .toThrow('Rate limit exceeded');

      // Fast-forward time
      jest.advanceTimersByTime(60000); // 1 minute

      // Try again after cooldown
      const result = await Translator.translate('שלום', 'he', 'en');
      expect(result).toBe('Hello');
    }, 30000); // Increase timeout to 30 seconds
  });

  describe('Error Handling', () => {
    it('should handle translation service errors', async () => {
      // Mock translation service error
      jest.spyOn(Translator, 'callTranslationAPI').mockRejectedValueOnce(new Error('Service error'));
      
      await expect(Translator.translate('שלום', 'he', 'en'))
        .rejects
        .toThrow('Translation service error');
    });

    it('should handle invalid input', async () => {
      await expect(Translator.translate(null, 'he', 'en'))
        .rejects
        .toThrow('Invalid input');
    });
  });
});