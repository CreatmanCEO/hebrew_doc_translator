# Конфигурация API ключей

## Настройка

1. Скопируйте шаблон конфигурации:
```bash
cp api_keys.template.json api_keys.json
```

2. Отредактируйте `api_keys.json` и добавьте ваши ключи API:
- OpenAI API ключи
- Google API ключи
- Huggingface токен
- Redis конфигурацию
- Другие API ключи

## Безопасность

- Файл `api_keys.json` добавлен в `.gitignore`
- НИКОГДА не коммитьте этот файл в репозиторий
- НИКОГДА не передавайте ключи API через публичные каналы
- Храните резервную копию ключей в безопасном месте

## Проверка ключей

Для проверки валидности ключей используйте команду:
```javascript
const keyManager = new ApiKeyManager();
const status = await keyManager.checkAllKeys();
console.log(status);
```

## Структура файла

```json
{
  "openai": {
    "keys": ["key1", "key2"],
    "organizations": ["org-id"]
  },
  "google": {
    "gemini": "key",
    "maps": ["key"]
  },
  "huggingface": {
    "token": "key"
  },
  "redis": {
    "host": "host",
    "port": "port",
    "password": "pass"
  },
  "other_apis": {
    "judge0": "key",
    "hume": "key",
    "rapid_api": "key"
  }
}
```

## Обновление ключей

1. Остановите сервер
2. Обновите ключи в `api_keys.json`
3. Очистите Redis кэш:
```javascript
await keyManager.clearBlacklist();
```
4. Перезапустите сервер 