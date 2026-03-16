// =====================================================
// EDI WORKER LOGGER
// Centralized logging for EDI worker activities
// Logs to database table: edi_worker_logs
// =====================================================

const { runUpdate } = require('./db_utils');

/**
 * Log types
 */
const LOG_TYPES = {
  CYCLE_START: 'CYCLE_START',
  CYCLE_END: 'CYCLE_END',
  TRANSMISSION: 'TRANSMISSION',
  ERROR: 'ERROR',
  INFO: 'INFO',
  WARNING: 'WARNING',
  CLEANUP: 'CLEANUP'
};

/**
 * Worker types
 */
const WORKER_TYPES = {
  OUTBOUND: 'OUTBOUND',
  INBOUND: 'INBOUND',
  CLEANUP: 'CLEANUP'
};

/**
 * Log levels
 */
const LOG_LEVELS = {
  DEBUG: 'DEBUG',
  INFO: 'INFO',
  WARNING: 'WARNING',
  ERROR: 'ERROR'
};

/**
 * Log a worker activity to the database
 * @param {Object} db - Database connection
 * @param {Object} params - Log parameters
 * @param {string} params.logType - Type of log (CYCLE_START, TRANSMISSION, etc.)
 * @param {string} params.workerType - Worker type (OUTBOUND, INBOUND, CLEANUP)
 * @param {number} params.transmissionId - Related transmission ID (optional)
 * @param {string} params.level - Log level (DEBUG, INFO, WARNING, ERROR)
 * @param {string} params.message - Log message
 * @param {Object} params.details - Additional structured data (optional)
 * @param {number} params.durationMs - Duration in milliseconds (optional)
 */
async function logWorkerActivity(db, params) {
  const {
    logType,
    workerType,
    transmissionId = null,
    level = LOG_LEVELS.INFO,
    message,
    details = null,
    durationMs = null
  } = params;

  try {
    const query = `
      INSERT INTO edi_worker_logs (
        log_type, worker_type, transmission_id, level,
        message, details, duration_ms, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `;

    const detailsJson = details ? JSON.stringify(details) : null;

    await runUpdate(db, query, [
      logType,
      workerType,
      transmissionId,
      level,
      message,
      detailsJson,
      durationMs
    ]);
  } catch (err) {
    // Don't throw - logging should never break the worker
    console.error('[WORKER LOGGER] Failed to log to database:', err.message);
  }
}

/**
 * Log cycle start
 */
async function logCycleStart(db, workerType) {
  await logWorkerActivity(db, {
    logType: LOG_TYPES.CYCLE_START,
    workerType,
    level: LOG_LEVELS.DEBUG,
    message: `${workerType} processing cycle started`
  });
}

/**
 * Log cycle end
 */
async function logCycleEnd(db, workerType, durationMs, stats = {}) {
  await logWorkerActivity(db, {
    logType: LOG_TYPES.CYCLE_END,
    workerType,
    level: LOG_LEVELS.INFO,
    message: `${workerType} processing cycle completed`,
    details: {
      duration_ms: durationMs,
      ...stats
    },
    durationMs
  });
}

/**
 * Log transmission processing
 */
async function logTransmission(db, workerType, transmissionId, status, message, details = {}) {
  const level = status === 'SUCCESS' ? LOG_LEVELS.INFO : 
                status === 'ERROR' ? LOG_LEVELS.ERROR : 
                LOG_LEVELS.WARNING;

  await logWorkerActivity(db, {
    logType: LOG_TYPES.TRANSMISSION,
    workerType,
    transmissionId,
    level,
    message,
    details: {
      status,
      ...details
    }
  });
}

/**
 * Log error
 */
async function logError(db, workerType, message, error, transmissionId = null) {
  await logWorkerActivity(db, {
    logType: LOG_TYPES.ERROR,
    workerType,
    transmissionId,
    level: LOG_LEVELS.ERROR,
    message,
    details: {
      error_message: error.message,
      error_stack: error.stack,
      error_code: error.code
    }
  });
}

/**
 * Log warning
 */
async function logWarning(db, workerType, message, details = {}) {
  await logWorkerActivity(db, {
    logType: LOG_TYPES.WARNING,
    workerType,
    level: LOG_LEVELS.WARNING,
    message,
    details
  });
}

/**
 * Log info
 */
async function logInfo(db, workerType, message, details = {}) {
  await logWorkerActivity(db, {
    logType: LOG_TYPES.INFO,
    workerType,
    level: LOG_LEVELS.INFO,
    message,
    details
  });
}

/**
 * Get recent worker logs
 * @param {Object} db - Database connection
 * @param {Object} filters - Filter options
 * @param {string} filters.workerType - Filter by worker type
 * @param {string} filters.level - Filter by log level
 * @param {number} filters.transmissionId - Filter by transmission ID
 * @param {number} filters.hours - Get logs from last N hours (default: 24)
 * @param {number} filters.limit - Max results (default: 100)
 */
async function getWorkerLogs(db, filters = {}) {
  const {
    workerType = null,
    level = null,
    transmissionId = null,
    hours = 24,
    limit = 100
  } = filters;

  const { queryDB } = require('./db_utils');
  
  // Calculate cutoff date in JS for compatibility
  const cutoffDate = new Date(Date.now() - (hours * 60 * 60 * 1000));
  // Format as 'YYYY-MM-DD HH:mm:ss' which works for both MySQL and SQLite
  const cutoffDateStr = cutoffDate.toISOString().slice(0, 19).replace('T', ' ');

  let query = `
    SELECT 
      id, log_type, worker_type, transmission_id, level,
      message, details, duration_ms, created_at
    FROM edi_worker_logs
    WHERE created_at >= ?
  `;
  const params = [cutoffDateStr];

  if (workerType) {
    query += ` AND worker_type = ?`;
    params.push(workerType);
  }

  if (level) {
    query += ` AND level = ?`;
    params.push(level);
  }

  if (transmissionId) {
    query += ` AND transmission_id = ?`;
    params.push(transmissionId);
  }

  query += ` ORDER BY created_at DESC LIMIT ?`;
  params.push(limit);

  try {
    return await queryDB(db, query, params);
  } catch (err) {
    console.error('[WORKER LOGGER] Failed to get logs:', err.message);
    return [];
  }
}

/**
 * Get worker statistics
 */
async function getWorkerStats(db, hours = 24) {
  const { queryDB } = require('./db_utils');
  
  // Calculate cutoff date in JS for compatibility
  const cutoffDate = new Date(Date.now() - (hours * 60 * 60 * 1000));
  const cutoffDateStr = cutoffDate.toISOString().slice(0, 19).replace('T', ' ');

  const query = `
    SELECT 
      worker_type,
      log_type,
      level,
      COUNT(*) as count,
      AVG(duration_ms) as avg_duration_ms,
      MAX(duration_ms) as max_duration_ms,
      MIN(created_at) as first_log,
      MAX(created_at) as last_log
    FROM edi_worker_logs
    WHERE created_at >= ?
    GROUP BY worker_type, log_type, level
    ORDER BY worker_type, log_type, level
  `;

  try {
    return await queryDB(db, query, [cutoffDateStr]);
  } catch (err) {
    console.error('[WORKER LOGGER] Failed to get stats:', err.message);
    return [];
  }
}

module.exports = {
  LOG_TYPES,
  WORKER_TYPES,
  LOG_LEVELS,
  logWorkerActivity,
  logCycleStart,
  logCycleEnd,
  logTransmission,
  logError,
  logWarning,
  logInfo,
  getWorkerLogs,
  getWorkerStats
};
