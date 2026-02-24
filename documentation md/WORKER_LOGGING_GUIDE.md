# EDI Worker Logging System

Complete logging system for tracking all EDI worker activities with automatic daily cleanup.

## Overview

The worker logging system provides:
- **Detailed activity tracking** for all OUTBOUND, INBOUND, and CLEANUP operations
- **Structured JSON data** for complex information
- **Automatic daily cleanup** (retains 7 days of logs)
- **Query API endpoints** for filtering and analyzing logs
- **Performance metrics** (cycle durations, success/error rates)

---

## Database Setup

### 1. Run the Migration

Execute the SQL migration to create the `edi_worker_logs` table and cleanup event:

```bash
mysql -u root -p EntiteDb < backend/migrations/edi_worker_logs.sql
```

### 2. Verify Installation

```sql
-- Check table exists
SELECT COUNT(*) FROM edi_worker_logs;

-- Check event scheduler is enabled
SELECT @@global.event_scheduler;

-- View cleanup event
SELECT EVENT_NAME, STATUS, INTERVAL_VALUE, INTERVAL_FIELD
FROM information_schema.EVENTS
WHERE EVENT_SCHEMA = 'EntiteDb' 
  AND EVENT_NAME = 'cleanup_edi_worker_logs';
```

---

## Table Schema

```sql
CREATE TABLE edi_worker_logs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  log_type VARCHAR(20) NOT NULL,        -- CYCLE_START, CYCLE_END, TRANSMISSION, ERROR, INFO, WARNING
  worker_type VARCHAR(20) NOT NULL,     -- OUTBOUND, INBOUND, CLEANUP
  transmission_id INT,                  -- Related transmission ID (nullable)
  level VARCHAR(10) DEFAULT 'INFO',     -- DEBUG, INFO, WARNING, ERROR
  message TEXT NOT NULL,                -- Log message
  details JSON,                         -- Structured data (stats, errors, etc.)
  duration_ms INT,                      -- Duration for cycles/transmissions
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  INDEX idx_created_at (created_at),
  INDEX idx_worker_type (worker_type),
  INDEX idx_log_type (log_type),
  INDEX idx_level (level),
  INDEX idx_transmission_id (transmission_id)
);
```

---

## Log Types

### CYCLE_START
- Logged when a worker cycle begins
- No duration (duration_ms = NULL)
- Level: DEBUG

### CYCLE_END
- Logged when a worker cycle completes
- Includes duration_ms and statistics in details JSON
- Level: INFO

### TRANSMISSION
- Logged for each transmission processed
- Includes transmission_id and processing details
- Level: INFO (success) or ERROR (failure)

### ERROR
- Logged for critical errors
- Includes error stack trace in details JSON
- Level: ERROR

### INFO / WARNING
- General informational or warning messages
- Level: INFO or WARNING

---

## API Endpoints

### Get Worker Logs

```bash
GET /api/edi/worker-logs
Headers: x-api-pin: 3311
Query Parameters:
  - workerType: OUTBOUND | INBOUND | CLEANUP (optional)
  - level: DEBUG | INFO | WARNING | ERROR (optional)
  - transmissionId: number (optional)
  - hours: number (default: 24) - logs from last N hours
  - limit: number (default: 100) - max results
```

**Examples:**

```bash
# Get all logs from last 24 hours
curl -H "x-api-pin: 3311" \
  "http://localhost:3000/api/edi/worker-logs"

# Get OUTBOUND errors from last 2 hours
curl -H "x-api-pin: 3311" \
  "http://localhost:3000/api/edi/worker-logs?workerType=OUTBOUND&level=ERROR&hours=2"

# Get logs for specific transmission
curl -H "x-api-pin: 3311" \
  "http://localhost:3000/api/edi/worker-logs?transmissionId=123"

# Get last 50 INBOUND logs
curl -H "x-api-pin: 3311" \
  "http://localhost:3000/api/edi/worker-logs?workerType=INBOUND&limit=50"
```

**Response:**
```json
{
  "count": 45,
  "filters": {
    "workerType": "OUTBOUND",
    "level": null,
    "transmissionId": null,
    "hours": "24",
    "limit": "100"
  },
  "logs": [
    {
      "id": 1234,
      "log_type": "CYCLE_END",
      "worker_type": "OUTBOUND",
      "transmission_id": null,
      "level": "INFO",
      "message": "OUTBOUND processing cycle completed",
      "details": {
        "duration_ms": 1523,
        "transmissions_found": 3,
        "transmissions_processed": 3,
        "success_count": 2,
        "error_count": 1
      },
      "duration_ms": 1523,
      "created_at": "2026-01-16T19:30:15.000Z"
    },
    {
      "id": 1235,
      "log_type": "TRANSMISSION",
      "worker_type": "OUTBOUND",
      "transmission_id": 45,
      "level": "INFO",
      "message": "Transmission sent successfully",
      "details": {
        "document_type": "ORDERS",
        "partner_gln": "1234567890123",
        "response": { "success": true }
      },
      "duration_ms": null,
      "created_at": "2026-01-16T19:30:14.000Z"
    }
  ]
}
```

### Get Worker Statistics

```bash
GET /api/edi/worker-stats
Headers: x-api-pin: 3311
Query Parameters:
  - hours: number (default: 24) - statistics period
```

**Example:**

```bash
# Get statistics for last 24 hours
curl -H "x-api-pin: 3311" \
  "http://localhost:3000/api/edi/worker-stats?hours=24"
```

**Response:**
```json
{
  "period_hours": 24,
  "stats": [
    {
      "worker_type": "OUTBOUND",
      "log_type": "CYCLE_END",
      "level": "INFO",
      "count": 48,
      "avg_duration_ms": 1245.5,
      "max_duration_ms": 3421,
      "first_log": "2026-01-15T19:30:00.000Z",
      "last_log": "2026-01-16T19:30:00.000Z"
    },
    {
      "worker_type": "OUTBOUND",
      "log_type": "TRANSMISSION",
      "level": "INFO",
      "count": 142,
      "avg_duration_ms": null,
      "max_duration_ms": null,
      "first_log": "2026-01-15T19:30:05.000Z",
      "last_log": "2026-01-16T19:29:55.000Z"
    },
    {
      "worker_type": "OUTBOUND",
      "log_type": "TRANSMISSION",
      "level": "ERROR",
      "count": 8,
      "avg_duration_ms": null,
      "max_duration_ms": null,
      "first_log": "2026-01-15T20:15:30.000Z",
      "last_log": "2026-01-16T18:45:12.000Z"
    }
  ]
}
```

---

## SQL Queries

### Recent Activity by Worker Type

```sql
SELECT 
  worker_type,
  log_type,
  COUNT(*) as count,
  MIN(created_at) as first_activity,
  MAX(created_at) as last_activity
FROM edi_worker_logs
WHERE created_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR)
GROUP BY worker_type, log_type
ORDER BY worker_type, log_type;
```

### Error Analysis

```sql
SELECT 
  worker_type,
  transmission_id,
  message,
  JSON_EXTRACT(details, '$.error_details') as error_details,
  created_at
FROM edi_worker_logs
WHERE level = 'ERROR'
  AND created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
ORDER BY created_at DESC;
```

### Performance Metrics

```sql
SELECT 
  worker_type,
  AVG(duration_ms) as avg_duration,
  MIN(duration_ms) as min_duration,
  MAX(duration_ms) as max_duration,
  COUNT(*) as cycle_count
FROM edi_worker_logs
WHERE log_type = 'CYCLE_END'
  AND created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
GROUP BY worker_type;
```

### Transmission Success Rate

```sql
SELECT 
  worker_type,
  SUM(CASE WHEN level = 'INFO' THEN 1 ELSE 0 END) as success_count,
  SUM(CASE WHEN level = 'ERROR' THEN 1 ELSE 0 END) as error_count,
  COUNT(*) as total_count,
  ROUND(100.0 * SUM(CASE WHEN level = 'INFO' THEN 1 ELSE 0 END) / COUNT(*), 2) as success_rate_pct
FROM edi_worker_logs
WHERE log_type = 'TRANSMISSION'
  AND created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
GROUP BY worker_type;
```

### Logs for Specific Transmission

```sql
SELECT 
  id,
  log_type,
  worker_type,
  level,
  message,
  details,
  duration_ms,
  created_at
FROM edi_worker_logs
WHERE transmission_id = 123
ORDER BY created_at DESC;
```

---

## Automatic Cleanup

### Cleanup Schedule

- **Runs:** Daily at 2:00 AM
- **Retention:** 7 days
- **Action:** Deletes logs older than 7 days
- **Self-logging:** Records cleanup action in the logs table

### Manual Cleanup

```sql
-- Delete logs older than 7 days
DELETE FROM edi_worker_logs 
WHERE created_at < DATE_SUB(NOW(), INTERVAL 7 DAY);

-- Check cleanup event status
SHOW EVENTS WHERE Name = 'cleanup_edi_worker_logs';

-- Disable cleanup event
ALTER EVENT cleanup_edi_worker_logs DISABLE;

-- Enable cleanup event
ALTER EVENT cleanup_edi_worker_logs ENABLE;
```

### Adjust Retention Period

Edit the event to change retention:

```sql
DROP EVENT IF EXISTS cleanup_edi_worker_logs;

DELIMITER $$
CREATE EVENT cleanup_edi_worker_logs
ON SCHEDULE EVERY 1 DAY
STARTS (TIMESTAMP(CURRENT_DATE) + INTERVAL 1 DAY + INTERVAL 2 HOUR)
DO BEGIN
  -- Change INTERVAL 7 DAY to desired retention period
  DELETE FROM edi_worker_logs 
  WHERE created_at < DATE_SUB(NOW(), INTERVAL 30 DAY);  -- 30 days retention
  
  INSERT INTO edi_worker_logs (log_type, worker_type, level, message, details)
  VALUES (
    'INFO', 'CLEANUP', 'INFO',
    'Daily worker logs cleanup completed',
    JSON_OBJECT('deleted_count', ROW_COUNT(), 'retention_days', 30)
  );
END$$
DELIMITER ;
```

---

## Monitoring & Troubleshooting

### Check Worker Activity

```bash
# Recent worker activity
curl -H "x-api-pin: 3311" \
  "http://localhost:3000/api/edi/worker-logs?hours=1&limit=20"

# Check for errors
curl -H "x-api-pin: 3311" \
  "http://localhost:3000/api/edi/worker-logs?level=ERROR&hours=24"
```

### Verify Logging is Working

After restarting the server, check that logs are being created:

```sql
SELECT COUNT(*) as recent_logs
FROM edi_worker_logs
WHERE created_at >= DATE_SUB(NOW(), INTERVAL 5 MINUTE);
```

### Common Issues

**No logs appearing:**
- Verify table exists: `SHOW TABLES LIKE 'edi_worker_logs';`
- Check worker is running: `GET /api/edi/worker-stats`
- Verify verbose logging is enabled in config

**Event scheduler not running:**
```sql
-- Check status
SELECT @@global.event_scheduler;

-- Enable it
SET GLOBAL event_scheduler = ON;
```

---

## Integration

The logging system is automatically integrated into the EDI worker. No additional configuration needed beyond running the migration.

### Files

- **Migration:** `backend/migrations/edi_worker_logs.sql`
- **Logger Module:** `backend/edi_worker_logger.js`
- **Worker Integration:** `backend/workers/edi_worker.js`
- **API Endpoints:** `backend/server.js` (lines 4368-4417)

### Configuration

Logging verbosity is controlled in `backend/config/edi_worker_config.js`:

```javascript
logging: {
  enabled: true,
  verbose: true,  // Set to false to reduce log volume
}
```

---

## Next Steps

1. **Run the migration** to create the table and cleanup event
2. **Restart your backend server** to load the logging integration
3. **Monitor logs** using the API endpoints or SQL queries
4. **Adjust retention** if 7 days is not suitable for your needs

The worker will now automatically log all activities to the database with daily cleanup!
