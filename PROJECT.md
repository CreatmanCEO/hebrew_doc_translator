# Переводчик документов с иврита

## 1. Описание проекта и возможности
Веб-приложение для перевода документов с иврита на русский и английский языки с сохранением оригинального форматирования и обработкой смешанного контента (текст на разных языках + изображения).

### Основные возможности
- Загрузка PDF и DOCX файлов
- Определение языка текстовых блоков
- Сохранение изображений и их позиционирования
- Перевод только ивритского текста
- Сохранение оригинального форматирования
- Поддержка RTL/LTR
- Предпросмотр документов

## 2. Архитектура

### Backend

#### Core Services
1. **DocumentAnalyzer**
   - Анализ структуры документов
   - Извлечение метаданных
   - Статус: Реализовано
   - Файл: server/services/DocumentAnalyzer.js

2. **LayoutExtractor**
   - Анализ разметки
   - Построение иерархии документа
   - Статус: Реализовано
   - Файл: server/services/LayoutExtractor.js

3. **TextExtractor**
   - OCR для иврита
   - Определение языка
   - Извлечение изображений
   - Статус: Реализовано
   - Файл: server/services/TextExtractor.js

4. **Translator**
   - Перевод текстовых блоков
   - Кэширование переводов
   - Сохранение форматирования
   - Статус: Реализовано
   - Файл: server/services/Translator.js

5. **DocumentGenerator**
   - Генерация PDF/DOCX
   - Поддержка RTL
   - Вставка изображений
   - Работа со смешанным контентом
   - RTL/LTR автоопределение
   - Статус: Реализовано
   - Файл: server/services/DocumentGenerator.js

#### Модели данных
1. **DocumentBlock**
   - Представление блоков контента
   - Поддержка текста и изображений
   - Файл: server/models/DocumentBlock.js

2. **LayoutInfo**
   - Информация о разметке
   - Метаданные документа
   - Файл: server/models/LayoutInfo.js

### Frontend

#### Компоненты
1. **DocumentUpload**
   - Загрузка файлов через drag-n-drop
   - Валидация типов и размера
   - Визуальная обратная связь
   - Файл: client/src/components/DocumentUpload.js

2. **DocumentPreview**
   - Предпросмотр PDF и DOCX
   - Постраничная навигация
   - RTL/LTR поддержка
   - Адаптивный дизайн
   - Файл: client/src/components/DocumentPreview.js

3. **TranslationProgress**
   - Индикация этапов обработки
   - Процент выполнения
   - Обработка ошибок
   - Детали процесса
   - Файл: client/src/components/TranslationProgress.js

4. **App**
   - Основной компонент
   - Управление состоянием
   - API интеграция
   - Выбор языка
   - Файл: client/src/App.js

## 3. API и интеграция

### API Endpoints
1. Загрузка документа:
```http
POST /api/translate
Content-Type: multipart/form-data

file: [документ]
from: "he"
to: "en"
```

2. Статус перевода:
```http
GET /api/status/:jobId
Response: {
  status: "processing" | "completed" | "failed",
  progress: 0-100,
  error?: string
}
```

3. Загрузка результата:
```http
GET /api/download/:jobId
Response: [переведенный документ]
```

### WebSocket События
```javascript
socket.on('translation:progress', (data) => {
  console.log(`Progress: ${data.progress}%`);
});

socket.on('translation:complete', (data) => {
  console.log(`Complete: ${data.downloadUrl}`);
});
```

### Очередь Обработки
- Bull queue для асинхронной обработки
- Ограничение: 5 задач одновременно
- Сохранение состояния в Redis
- Очистка временных файлов

### Безопасность
- Rate limiting: 100 запросов/15 минут
- CORS защита
- Helmet middleware
- Валидация файлов
- Очистка временных файлов

## 4. Развертывание и конфигурация

### Требования
1. Окружение:
   - Node.js >= 18.0.0
   - Redis
   - Docker (опционально)

2. Конфигурация:
   ```env
   # .env
   PORT=3000
   REDIS_URL=redis://localhost:6379
   AZURE_TRANSLATOR_KEY=your_key
   RATE_LIMIT_WINDOW=60000
   RATE_LIMIT_MAX=10
   ```

3. Запуск:
   ```bash
   # Разработка
   npm run dev:full

   # Продакшн
   npm run build
   npm start
   ```

### Docker
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
```

## 5. Мониторинг и метрики

### Ключевые метрики
1. Производительность:
   - Время обработки документа
   - Использование памяти
   - Загрузка CPU
   - Задержки API переводчика

2. Качество:
   - Точность перевода
   - Сохранение форматирования
   - Количество ошибок
   - Успешность OCR

3. Использование:
   - Количество запросов
   - Размеры документов
   - Типы файлов
   - Языковые пары

### Система мониторинга
1. Логирование:
   ```javascript
   const logger = winston.createLogger({
     level: 'info',
     format: winston.format.json(),
     transports: [
       new winston.transports.File({ filename: 'error.log', level: 'error' }),
       new winston.transports.File({ filename: 'combined.log' })
     ]
   });
   ```

2. Метрики:
   ```javascript
   const metrics = {
     documentProcessed: new Counter('doc_processed_total'),
     translationTime: new Histogram('translation_duration_seconds'),
     errorRate: new Counter('translation_errors_total'),
     queueLength: new Gauge('translation_queue_length')
   };
   ```

## 6. План развития

### Оптимизация
- Кэширование переводов в Redis
- Параллельная обработка частей документа
- Сжатие временных файлов
- Оптимизация памяти при обработке больших документов
- Оптимизация очереди

### Надежность
- Автоматическое восстановление после сбоев
- Резервное копирование состояния
- Мониторинг здоровья системы
- Метрики производительности

### Функциональность
- Предпросмотр перевода в реальном времени
- Пакетная обработка документов
- API для внешних интеграций
- Поддержка дополнительных форматов
- Улучшение качества OCR

### Тестирование
- Unit тесты компонентов
- Интеграционные тесты API
- E2E тесты процесса
- Load testing
- Fault tolerance tests

### CI/CD
- GitHub Actions
- Автоматическое тестирование
- Деплой в облако

## 7. История изменений

### 01.02.2025
- Добавлено тестирование компонентов
- Обновлена документация тестов
- Добавлены примеры использования

### 27.01.2025
- Исправление ошибок линтера
- Обновление зависимостей
- Реструктуризация кода

### 26.01.2025
- Инициализация проекта
- Базовая структура
- Настройка окружения 