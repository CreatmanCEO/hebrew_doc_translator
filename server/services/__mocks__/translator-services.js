const mockTranslations = {
  'שלום': 'Hello',
  'שָׁלוֹם': 'Hello',
  'test': 'тест',
  'Hello123': 'Hello123'
};

const mockState = {
  shouldFail: false,
  rateLimitExceeded: false,
  delay: 0,
  customResponses: new Map()
};

const resetState = () => {
  mockState.shouldFail = false;
  mockState.rateLimitExceeded = false;
  mockState.delay = 0;
  mockState.customResponses.clear();
};

// Мок для google-translate
const translate = jest.fn(async (text, options = {}) => {
  if (mockState.delay) {
    await new Promise(resolve => setTimeout(resolve, mockState.delay));
  }

  if (mockState.rateLimitExceeded) {
    throw new Error('Too Many Requests');
  }

  if (mockState.shouldFail) {
    throw new Error('API Error');
  }

  return { text: mockTranslations[text] || text };
});

// Мок для hebrew-transliteration
const transliterate = jest.fn((text) => {
  return text;
});

module.exports = {
  translate,
  transliterate,
  mockState,
  resetState,
  setupMocks: () => {
    jest.mock('@vitalets/google-translate-api', () => ({
      translate
    }));
    jest.mock('hebrew-transliteration', () => ({
      transliterate
    }));
  }
};