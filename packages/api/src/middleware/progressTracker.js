const Redis = require('ioredis');
const { logger } = require('./errorHandler');

// Инициализация Redis
const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  retryStrategy: (times) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  }
});

class ProgressTracker {
  constructor(io) {
    this.io = io;
    this.redis = redis;
  }

  // Создание нового процесса
  async createProcess(jobId) {
    try {
      await this.redis.hmset(`job:${jobId}`, {
        status: 'started',
        progress: 0,
        step: 'initialization',
        error: ''
      });
      return jobId;
    } catch (error) {
      logger.error('Error creating process:', error);
      throw error;
    }
  }

  // Обновление прогресса
  async updateProgress(jobId, progress, step, details = {}) {
    try {
      await this.redis.hmset(`job:${jobId}`, {
        progress: progress.toString(),
        step,
        details: JSON.stringify(details)
      });

      this.io.to(jobId).emit('progressUpdate', {
        jobId,
        progress,
        step,
        details
      });
    } catch (error) {
      logger.error('Error updating progress:', error);
    }
  }

  // Завершение процесса
  async completeProcess(jobId, result = {}) {
    try {
      await this.redis.hmset(`job:${jobId}`, {
        status: 'completed',
        progress: '100',
        result: JSON.stringify(result)
      });

      this.io.to(jobId).emit('processCompleted', {
        jobId,
        result
      });

      // Удаляем данные через час
      setTimeout(() => {
        this.redis.del(`job:${jobId}`);
      }, 3600000);
    } catch (error) {
      logger.error('Error completing process:', error);
    }
  }

  // Обработка ошибки
  async handleError(jobId, error) {
    try {
      await this.redis.hmset(`job:${jobId}`, {
        status: 'error',
        error: error.message
      });

      this.io.to(jobId).emit('processError', {
        jobId,
        error: error.message
      });
    } catch (err) {
      logger.error('Error handling process error:', err);
    }
  }

  // Получение статуса процесса
  async getProcessStatus(jobId) {
    try {
      const status = await this.redis.hgetall(`job:${jobId}`);
      return status;
    } catch (error) {
      logger.error('Error getting process status:', error);
      throw error;
    }
  }

  // Middleware для отслеживания прогресса
  middleware() {
    return async (req, res, next) => {
      const jobId = req.params.jobId || req.body.jobId;
      
      if (!jobId) {
        return next();
      }

      try {
        const status = await this.getProcessStatus(jobId);
        if (!status) {
          return res.status(404).json({ error: 'Process not found' });
        }
        
        req.processStatus = status;
        next();
      } catch (error) {
        next(error);
      }
    };
  }

  // Настройка WebSocket соединений
  setupSocketHandlers() {
    this.io.on('connection', (socket) => {
      // Подписка на обновления конкретного процесса
      socket.on('subscribeToJob', (jobId) => {
        socket.join(jobId);
      });

      // Отписка от обновлений
      socket.on('unsubscribeFromJob', (jobId) => {
        socket.leave(jobId);
      });

      // Запрос текущего статуса
      socket.on('getJobStatus', async (jobId) => {
        try {
          const status = await this.getProcessStatus(jobId);
          socket.emit('jobStatus', { jobId, status });
        } catch (error) {
          socket.emit('error', { 
            jobId, 
            error: 'Failed to get job status' 
          });
        }
      });

      // Обработка отключения
      socket.on('disconnect', () => {
        const rooms = Object.keys(socket.rooms);
        rooms.forEach(room => {
          if (room !== socket.id) {
            socket.leave(room);
          }
        });
      });
    });
  }

  // Утилиты для работы с прогрессом
  calculateProgress(current, total) {
    return Math.round((current / total) * 100);
  }

  // Форматирование времени
  formatTimeRemaining(startTime, progress) {
    if (progress <= 0) return 'calculating...';
    
    const elapsed = Date.now() - startTime;
    const total = (elapsed / progress) * 100;
    const remaining = total - elapsed;
    
    return this.formatDuration(remaining);
  }

  // Форматирование длительности
  formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    }
    if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    }
    return `${seconds}s`;
  }
}

module.exports = ProgressTracker;