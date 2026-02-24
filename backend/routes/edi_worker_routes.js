/**
 * Routes pour la gestion et le monitoring du worker EDI
 */

const express = require('express');
const router = express.Router();

// Référence au worker (sera injectée lors de l'initialisation)
let ediWorker = null;

/**
 * Initialiser les routes avec le worker
 */
function initializeRoutes(worker) {
  ediWorker = worker;
}

/**
 * GET /api/edi-worker/status
 * Obtenir le statut et les statistiques du worker
 */
router.get('/status', (req, res) => {
  if (!ediWorker) {
    return res.status(503).json({ error: 'EDI Worker not initialized' });
  }

  const stats = ediWorker.getStats();
  res.json(stats);
});

/**
 * POST /api/edi-worker/start
 * Démarrer le worker manuellement
 */
router.post('/start', (req, res) => {
  if (!ediWorker) {
    return res.status(503).json({ error: 'EDI Worker not initialized' });
  }

  if (ediWorker.isRunning) {
    return res.status(400).json({ error: 'Worker is already running' });
  }

  try {
    ediWorker.start();
    res.json({ success: true, message: 'EDI Worker started successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to start worker', details: err.message });
  }
});

/**
 * POST /api/edi-worker/stop
 * Arrêter le worker manuellement
 */
router.post('/stop', (req, res) => {
  if (!ediWorker) {
    return res.status(503).json({ error: 'EDI Worker not initialized' });
  }

  if (!ediWorker.isRunning) {
    return res.status(400).json({ error: 'Worker is not running' });
  }

  try {
    ediWorker.stop();
    res.json({ success: true, message: 'EDI Worker stopped successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to stop worker', details: err.message });
  }
});

/**
 * POST /api/edi-worker/process-now
 * Forcer un cycle de traitement immédiat
 */
router.post('/process-now', async (req, res) => {
  if (!ediWorker) {
    return res.status(503).json({ error: 'EDI Worker not initialized' });
  }

  if (!ediWorker.isRunning) {
    return res.status(400).json({ error: 'Worker is not running' });
  }

  const { direction } = req.body; // 'outbound', 'inbound', or 'both'

  try {
    if (direction === 'outbound' || direction === 'both') {
      await ediWorker.processOutbound();
    }
    if (direction === 'inbound' || direction === 'both') {
      await ediWorker.processInbound();
    }

    res.json({ 
      success: true, 
      message: `Processing cycle triggered for ${direction || 'both'} direction(s)` 
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to process', details: err.message });
  }
});

/**
 * POST /api/edi-worker/cleanup-now
 * Forcer un nettoyage immédiat
 */
router.post('/cleanup-now', async (req, res) => {
  if (!ediWorker) {
    return res.status(503).json({ error: 'EDI Worker not initialized' });
  }

  try {
    await ediWorker.cleanupOldTransmissions();
    res.json({ success: true, message: 'Cleanup completed' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to cleanup', details: err.message });
  }
});

module.exports = { router, initializeRoutes };
