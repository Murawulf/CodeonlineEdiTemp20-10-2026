const express = require('express');
const router = express.Router();
const HubController = require('../controllers/HubController');
const AckController = require('../controllers/AckController');

// Main Dispatch Endpoint (Standard & P2P Relay)
router.post('/dispatch', (req, res) => HubController.relayMessage(req, res));
router.post('/relay', (req, res) => HubController.relayMessage(req, res));

// ACK/NACK Endpoint — nodes report processing result, hub generates & routes the APERAK
// POST /api/orchestrator/ack
router.post('/ack', (req, res) => AckController.handleAck(req, res));

// Audit Sync Endpoint (for P2P logs)
router.post('/audit/sync', (req, res) => HubController.syncOfflineLogs(req, res));

// Discovery Endpoint (for Nodes to fetch directory)
router.get('/discovery', (req, res) => HubController.getDirectory(req, res));

module.exports = router;
