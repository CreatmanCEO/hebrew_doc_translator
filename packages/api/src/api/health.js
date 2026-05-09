const express = require("express");
const router = express.Router();

/**
 * Health check endpoint
 * Returns system health status for monitoring
 */
router.get("/health", async (req, res) => {
  const healthCheck = {
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: {
      used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
      unit: "MB"
    }
  };

  // Check Redis connection if available
  try {
    const redis = req.app.get("redis");
    if (redis) {
      await redis.ping();
      healthCheck.redis = "connected";
    }
  } catch (error) {
    healthCheck.redis = "disconnected";
    healthCheck.status = "degraded";
  }

  const statusCode = healthCheck.status === "ok" ? 200 : 503;
  res.status(statusCode).json(healthCheck);
});

/**
 * Readiness check endpoint
 * Returns whether the service is ready to accept traffic
 */
router.get("/ready", (req, res) => {
  // Add any startup checks here
  res.json({ ready: true });
});

/**
 * Liveness check endpoint
 * Returns whether the service is alive
 */
router.get("/live", (req, res) => {
  res.json({ alive: true });
});

module.exports = router;
