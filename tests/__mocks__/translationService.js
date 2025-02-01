// Базовые ответы для тестов
const defaultTranslations = {
  'שלום': 'Hello',
  'שָׁלוֹם': 'Hello',
  'test': 'тест',
  'Hello123': 'Hello123'
};

// Состояние мока
let mockState = {
  shouldFail: false,
  rateLimitExceeded: false,
  delay: 0,
  customResponses: new Map()
};

// Функции управления моком
export const mockConfig = {
  setShouldFail(value) {
    mockState.shouldFail = value;
  },
  setRateLimitExceeded(value) {
    mockState.rateLimitExceeded = value;
  },
  setDelay(ms) {
    mockState.delay = ms;
  },
  addCustomResponse(text, response) {
    mockState.customResponses.set(text, response);
  },
  reset() {
    mockState = {
      shouldFail: false,
      rateLimitExceeded: false,
      delay: 0,
      customResponses: new Map()
    };
  }
};

// Мок для google-translate-api
export const translate = async (text, options = {}) => {
  if (mockState.delay) {
    await new Promise(resolve => setTimeout(resolve, mockState.delay));
  }

  if (mockState.rateLimitExceeded) {
    throw new Error('Too Many Requests');
  }

  if (mockState.shouldFail) {
    throw new Error('Translation failed: API error');
  }

  const customResponse = mockState.customResponses.get(text);
  if (customResponse) {
    return { text: customResponse };
  }

  return { 
    text: defaultTranslations[text] || text,
    raw: {
      sentences: [{ trans: defaultTranslations[text] || text }]
    }
  };
};

// Мок для hebrew-transliteration
export const transliterate = (text) => {
  // Простая транслитерация для тестов
  return text.replace(/[^\u0590-\u05FF\s]/g, match => match);
};