// @hdt/shared — общие контракты HDT-монорепы.
// JSDoc-типизированные экспорты; формальные интерфейсы — в ARCHITECTURE.md §3.

const { envSchema } = require('./env/schema');
const { LanguageRegistry } = require('./language/LanguageRegistry');
const { HebrewModule } = require('./language/HebrewModule');

module.exports = {
  envSchema,
  LanguageRegistry,
  HebrewModule,
};
