const defaultResponses = new Map([
  ['שלום', { text: 'Hello' }],
  ['שָׁלוֹם', { text: 'Hello' }],
  ['Hello123', { text: 'Hello123' }],
  ['test', { text: 'тест' }]
]);

let mockConfig = {
  shouldFail: false,
  rateLimitExceeded: false,
  delay: 0,
  customResponses: new Map()
};

const translate = async (text, options = {}) => {
  // Симулируем задержку сети
  if (mockConfig.delay) {
    await new Promise(resolve => setTimeout(resolve, mockConfig.delay));
  }

  // Симулируем ошибку rate limit
  if (mockConfig.rateLimitExceeded) {
    throw new Error('Too Many Requests');
  }

  // Симулируем общую ошибку API
  if (mockConfig.shouldFail) {
    throw new Error('API Error');
  }

  // Ищем заготовленный ответ
  const response = mockConfig.customResponses.get(text) || defaultResponses.get(text);
  
  if (response) {
    return response;
  }

  // Для неизвестного текста возвращаем его же
  return { text };
};

// Функции для конфигурации мока в тестах
const __mockConfig = {
  setShouldFail: (value) => {
    mockConfig.shouldFail = value;
  },
  setRateLimitExceeded: (value) => {
    mockConfig.rateLimitExceeded = value;
  },
  setDelay: (ms) => {
    mockConfig.delay = ms;
  },
  addCustomResponse: (text, response) => {
    mockConfig.customResponses.set(text, response);
  },
  reset: () => {
    mockConfig = {
      shouldFail: false,
      rateLimitExceeded: false,
      delay: 0,
      customResponses: new Map()
    };
  }
};

module.exports = {
  translate,
  __mockConfig
};