# EDI Error Transmission Workflow Guide

## Problem: ERROR Records Not Being Processed

### Why ERROR Records Aren't Immediately Processed

The EDI worker **does** process ERROR status records (configured in `config/edi_worker_config.js`), but uses **exponential backoff retry delays** to avoid hammering failed endpoints.

**Retry Delay Formula:**
```
delay = initialDelay × (backoffMultiplier ^ (retry_count - 1))
```

**Current Configuration:**
- Initial delay: 60 seconds (1 minute)
- Backoff multiplier: 2x
- Max delay: 1 hour

**Example Delays:**
- Retry 1: 1 minute
- Retry 2: 2 minutes  
- Retry 3: 4 minutes
- Retry 4: 8 minutes
- Retry 5: 16 minutes

The worker checks `updated_at + delay` and skips processing if the retry time hasn't arrived yet. This is why you don't see worker logs for ERROR records.

---

## Solution: Reset ERROR Transmission for Immediate Retry

### Option 1: Reset Endpoint (Recommended)

Use the new `/api/edi/transmissions/:id/reset` endpoint to reset retry_count to 0 and bypass the delay:

```bash
curl -X POST http://localhost:3000/api/edi/transmissions/2/reset \
  -H "x-api-pin: 3311" \
  -H "Content-Type: application/json"
```

**Response:**
```json
{
  "success": true,
  "message": "Transmission reset and queued for immediate retry (no delay)",
  "transmissionId": 2
}
```

The worker will process it in the next cycle (within 30 seconds).

### Option 2: Manual Database Update

```sql
UPDATE edi_transmissions 
SET retry_count = 0, status = 'PENDING', updated_at = NOW() 
WHERE id = 2;
```

---

## Complete EDI Workflow: OUTBOUND → INBOUND

### Automatic Workflow (After Fix)

When an OUTBOUND transmission is successfully sent, the EDI worker now **automatically creates** a corresponding INBOUND RECEIVED record:

1. **OUTBOUND Transmission** (status: ERROR)
   - Reset using `/api/edi/transmissions/:id/reset`
   - Worker picks it up within 30 seconds

2. **Worker Sends Message**
   - HTTP POST to EDI server
   - Updates OUTBOUND status to `SENT`
   - Sets `transmission_date`

3. **Auto-Create INBOUND Record**
   - Creates new transmission with:
     - `direction: 'INBOUND'`
     - `status: 'RECEIVED'`
     - Same `related_id`, `related_type`, `document_type`
     - Same `file_content` (EANCOM message)
   - Ready for INBOUND worker to process

4. **INBOUND Worker Processes**
   - Runs every 45 seconds
   - Processes `RECEIVED` status records
   - Updates to `PROCESSED` when complete

---

## Monitoring & Debugging

### Enable Verbose Logging

Already enabled in `config/edi_worker_config.js`:
```javascript
logging: {
  enabled: true,
  verbose: true,  // ✅ Now enabled
}
```

### Check Worker Logs

You should now see detailed logs:
```
[EDI WORKER] [OUTBOUND] Starting processing cycle...
[EDI WORKER] [OUTBOUND] Processing 1 transmission(s)...
[EDI WORKER] [OUTBOUND] Processing transmission #2 (ORDERS)
[EDI WORKER] [OUTBOUND] ✅ Transmission #2 sent successfully
[EDI WORKER] [OUTBOUND] ✅ Created INBOUND RECEIVED record #3 for transmission #2
```

### Query Transmissions

```sql
-- Check all transmissions for an order
SELECT id, direction, status, retry_count, created_at, updated_at 
FROM edi_transmissions 
WHERE related_id = 123 AND related_type = 'ORDER'
ORDER BY created_at DESC;

-- Check pending/error transmissions
SELECT id, direction, document_type, status, retry_count, 
       TIMESTAMPDIFF(MINUTE, updated_at, NOW()) as minutes_since_update
FROM edi_transmissions 
WHERE status IN ('PENDING', 'ERROR')
ORDER BY updated_at DESC;
```

---

## API Endpoints Reference

### Reset ERROR Transmission
```
POST /api/edi/transmissions/:id/reset
Headers: x-api-pin: 3311
```
Resets retry_count to 0 for immediate processing.

### Retry with Delay
```
POST /api/edi/transmissions/:id/retry
Headers: x-api-pin: 3311
```
Increments retry_count (will wait for backoff delay).

### Get Transmissions for Order
```
GET /api/edi/transmissions/:orderId
Headers: x-api-pin: 3311
```

---

## Configuration Files

- **Worker Config**: `backend/config/edi_worker_config.js`
- **Worker Logic**: `backend/workers/edi_worker.js`
- **Helper Functions**: `backend/edi_transmission_helper.js`

## Next Steps

1. **Restart your backend server** to load the changes
2. **Reset your ERROR record** using the reset endpoint
3. **Monitor the logs** to see the complete workflow
4. **Verify INBOUND record** is created automatically

The EDI worker will now handle the complete cycle automatically!
