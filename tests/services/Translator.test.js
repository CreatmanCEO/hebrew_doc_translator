const Translator = require('../../server/services/Translator');
const ApiKeyManager = require('../../server/services/ApiKeyManager');
const redis = require('../../server/config/redis');

jest.mock('openai');
jest.mock('hebrew-transliteration');
jest.mock('../../server/config/redis');

describe('Translator Service', () => {
  let translator;
  let mockOpenAI;

  beforeEach(() => {
    translator = new Translator();
    mockOpenAI = {
      createChatCompletion: jest.fn().mockResolvedValue({
        data: {
          choices: [{
            message: { content: 'Hello' }
          }]
        }
      })
    };
    jest.spyOn(translator, 'getOpenAIInstance').mockResolvedValue(mockOpenAI);
  });

  afterEach(() => {
    jest.clearAllMocks();
    redis.flushall();
  });

  describe('Basic Translation', () => {
    it('should translate text from Hebrew to English', async () => {
      const result = await translator.translateText('שלום', 'he', 'en');
      expect(result).toBe('Hello');
      expect(mockOpenAI.createChatCompletion).toHaveBeenCalled();
    });

    it('should use cache for repeated translations', async () => {
      // First translation
      await translator.translateText('שלום', 'he', 'en');
      
      // Second translation (should use cache)
      redis.get.mockResolvedValueOnce(JSON.stringify('Hello'));
      const result = await translator.translateText('שלום', 'he', 'en');
      
      expect(result).toBe('Hello');
      expect(mockOpenAI.createChatCompletion).toHaveBeenCalledTimes(1);
    });
  });

  describe('Error Handling', () => {
    it('should handle OpenAI API errors', async () => {
      mockOpenAI.createChatCompletion.mockRejectedValueOnce(new Error('API Error'));
      
      await expect(translator.translateText('שלום', 'he', 'en'))
        .rejects
        .toThrow('Translation failed: API Error');
    });

    it('should handle invalid language combinations', async () => {
      await expect(translator.translateText('Hello', 'fr', 'en'))
        .rejects
        .toThrow('Unsupported language combination');
    });
  });

  describe('API Key Management', () => {
    it('should try alternative key on authentication error', async () => {
      const error = new Error('Authentication error');
      error.response = { status: 401 };
      mockOpenAI.createChatCompletion
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce({
          data: {
            choices: [{
              message: { content: 'Hello' }
            }]
          }
        });

      const result = await translator.translateText('שלום', 'he', 'en');
      expect(result).toBe('Hello');
      expect(mockOpenAI.createChatCompletion).toHaveBeenCalledTimes(2);
    });
  });
});