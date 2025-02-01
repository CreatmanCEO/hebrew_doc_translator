const Translator = require('../../../server/services/Translator');
const { mockState, translate, transliterate, resetState } = require('../../../server/services/__mocks__/translator');

describe('Translator Service Unit Tests', () => {
  beforeEach(() => {
    resetState();
    jest.clearAllMocks();
  });

  describe('Basic Translation', () => {
    it('should translate simple text', async () => {
      const text = 'שלום';
      const result = await Translator.translate(text, 'he', 'en');
      expect(result).toBe('Hello');
    });

    it('should handle empty text', async () => {
      const result = await Translator.translate('', 'he', 'en');
      expect(result).toBe('');
    });

    it('should throw on invalid language code', async () => {
      await expect(Translator.translate('Hello', 'xx', 'en'))
        .rejects
        .toThrow('Invalid language code');
    });
  });

  describe('Mixed Content', () => {
    it('should preserve non-Hebrew parts', async () => {
      const text = 'Hello שלום World';
      const result = await Translator.translate(text, 'he', 'en');
      expect(result).toBe('Hello Hello World');
    });

    it('should handle special characters', async () => {
      const text = '!שלום?';
      const result = await Translator.translate(text, 'he', 'en');
      expect(result).toBe('!Hello?');
    });
  });

  describe('Error Handling', () => {
    it('should retry on temporary errors', async () => {
      mockState.shouldFail = true;
      mockState.failureCount = 2;
      
      const text = 'שלום';
      const result = await Translator.translate(text, 'he', 'en');
      
      expect(result).toBe('Hello');
      expect(translate).toHaveBeenCalledTimes(3);
    });

    it('should throw after max retries', async () => {
      mockState.shouldFail = true;
      mockState.failureCount = 5;
      
      await expect(Translator.translate('שלום', 'he', 'en'))
        .rejects
        .toThrow('Translation service unavailable');
    });
  });
});