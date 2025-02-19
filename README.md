# Настройка переменных окружения

## Начальная настройка

1. Скопируйте файл с примером переменных окружения:
```bash
cp .env.example .env
```

2. Отредактируйте файл `.env` и добавьте ваши значения:

### Основные настройки
```env
PORT=3000
```

### Redis
```env
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your_redis_password
TRANSLATION_CACHE_TTL=604800  # 7 дней в секундах
```

### OpenAI
```env
# Несколько ключей через запятую
OPENAI_API_KEYS=key1,key2,key3
OPENAI_ORG_IDS=org1,org2
```

### Google
```env
GOOGLE_GEMINI_KEY=your_gemini_key
GOOGLE_MAPS_KEYS=key1,key2
```

### Huggingface
```env
HUGGINGFACE_TOKEN=your_huggingface_token
```

### Другие API
```env
JUDGE0_API_KEY=your_judge0_key
HUME_API_KEY=your_hume_key
RAPID_API_KEY=your_rapid_api_key
```

### Ограничение запросов
```env
RATE_LIMIT_WINDOW=60000
RATE_LIMIT_MAX=10
```

## Безопасность

- Файл `.env` добавлен в `.gitignore`
- НИКОГДА не коммитьте файл `.env` в репозиторий
- Храните резервную копию `.env` в безопасном месте
- Используйте разные ключи для разработки и продакшена

## Проверка конфигурации

Для проверки настройки переменных окружения используйте:

```javascript
const ApiKeyManager = require('./server/services/ApiKeyManager');
const keyManager = new ApiKeyManager();

// Проверка OpenAI ключей
const openaiKey = await keyManager.getValidOpenAIKey();
console.log('Valid OpenAI key:', openaiKey);

// Проверка других сервисов
const geminiKey = keyManager.getServiceKey('gemini');
console.log('Gemini key:', geminiKey);
```

## Обновление ключей

1. Остановите сервер
2. Обновите значения в файле `.env`
3. Очистите Redis кэш:
```javascript
await keyManager.clearBlacklist();
```
4. Перезапустите сервер 