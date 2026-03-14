const express = require('express');
const router = express.Router();
const orchestratorController = require('../controllers/OrchestratorController');

// Initialize with DB when available (will be handled in server.js)
// router.post('/relay', (req, res) => orchestratorController.relayMessage(req, res));
// router.post('/audit/sync', (req, res) => orchestratorController.syncOfflineLogs(req, res));

// We export a function that accepts the DB instance to initialize the controller
module.exports = (db) => {
    orchestratorController.setDb(db);
    
    router.post('/relay', (req, res) => orchestratorController.relayMessage(req, res));
    router.post('/audit/sync', (req, res) => orchestratorController.syncOfflineLogs(req, res));
    
    // Discovery endpoint
    router.get('/discovery', (req, res) => orchestratorController.getDirectory(req, res));

    return router;
};
