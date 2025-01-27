const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const winston = require('winston');
require('dotenv').config();

const { errorHandler } = require('./middleware/errorHandler');
const ProgressTracker = require('./middleware/progressTracker');
const translateRouter = require('./api/translate');

// Initialize Express app
const app = express();
const server = http.createServer(app);

// Configure Socket.IO
const io = socketIO(server, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:3000',
    methods: ['GET', 'POST']
  }
});

// Basic middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:3000',
  methods: ['GET', 'POST'],
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use(limiter);

// Initialize ProgressTracker
const progressTracker = new ProgressTracker(io);
progressTracker.setupSocketHandlers();
app.set('progressTracker', progressTracker);

// Make app globally available for the queue
global.app = app;

// Static files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// API routes
app.use('/api', translateRouter);

// Error handling
app.use(errorHandler);

// Server startup
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

// Graceful shutdown handler
const shutdown = async (signal) => {
  winston.info(`Received ${signal}. Starting graceful shutdown...`);
  let exitCode = 0;

  try {
    // Stop accepting new connections
    server.close(() => {
      winston.info('HTTP server closed');
    });

    // Close Redis connection
    const redis = app.get('progressTracker').redis;
    if (redis) {
      await redis.quit();
      winston.info('Redis connection closed');
    }

    // Wait for existing connections to finish
    const forceExit = setTimeout(() => {
      winston.error('Could not close connections in time, forcefully shutting down');
      process.exitCode = 1;
      throw new Error('Force shutdown');
    }, 10000);

    // Clear timeout if everything closed normally
    clearTimeout(forceExit);
    winston.info('Graceful shutdown completed');
    process.exitCode = exitCode;
  } catch (error) {
    winston.error('Error during shutdown:', error);
    process.exitCode = 1;
  }
};

// Signal handlers
const shutdownSignals = ['SIGTERM', 'SIGINT', 'SIGUSR2'];
shutdownSignals.forEach((signal) => {
  process.on(signal, () => shutdown(signal));
});

// Uncaught error handlers
process.on('uncaughtException', (error) => {
  winston.error('Uncaught Exception:', error);
  process.exitCode = 1;
  shutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  winston.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exitCode = 1;
  shutdown('unhandledRejection');
});

module.exports = app;