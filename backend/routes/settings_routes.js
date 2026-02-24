/**
 * Settings Routes
 * ================
 * 
 * API endpoints for application settings/parameters management.
 * 
 * @module routes/settings_routes
 */

const express = require('express');
const router = express.Router();
const configService = require('../services/configService');

/**
 * GET /api/settings
 * Get all public configuration parameters for the frontend
 */
router.get('/', (req, res) => {
  try {
    const publicConfig = configService.getPublicConfig();
    res.json({
      success: true,
      data: publicConfig,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('[Settings API] Error fetching settings:', err.message);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch settings',
      message: err.message
    });
  }
});

/**
 * GET /api/settings/servers
 * Get server URLs configuration
 */
router.get('/servers', (req, res) => {
  try {
    const servers = configService.getServerUrls();
    res.json({
      success: true,
      data: servers
    });
  } catch (err) {
    console.error('[Settings API] Error fetching server URLs:', err.message);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch server URLs'
    });
  }
});

/**
 * GET /api/settings/:key
 * Get a specific parameter value
 */
router.get('/:key', (req, res) => {
  try {
    const { key } = req.params;
    const value = configService.get(key);
    
    if (value === null) {
      return res.status(404).json({
        success: false,
        error: `Parameter '${key}' not found`
      });
    }

    res.json({
      success: true,
      data: { key, value }
    });
  } catch (err) {
    console.error('[Settings API] Error fetching parameter:', err.message);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch parameter'
    });
  }
});

/**
 * PUT /api/settings/:key
 * Update a parameter value (requires authentication)
 */
router.put('/:key', async (req, res) => {
  try {
    const { key } = req.params;
    const { value } = req.body;

    if (value === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Value is required'
      });
    }

    const success = await configService.set(key, value);
    
    if (success) {
      res.json({
        success: true,
        message: `Parameter '${key}' updated successfully`,
        data: { key, value }
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to update parameter'
      });
    }
  } catch (err) {
    console.error('[Settings API] Error updating parameter:', err.message);
    res.status(500).json({
      success: false,
      error: 'Failed to update parameter'
    });
  }
});

/**
 * POST /api/settings/reload
 * Reload all parameters from database
 */
router.post('/reload', async (req, res) => {
  try {
    await configService.reload();
    res.json({
      success: true,
      message: 'Configuration reloaded successfully',
      data: configService.getPublicConfig()
    });
  } catch (err) {
    console.error('[Settings API] Error reloading configuration:', err.message);
    res.status(500).json({
      success: false,
      error: 'Failed to reload configuration'
    });
  }
});

/**
 * GET /api/settings/category/:category
 * Get all parameters in a specific category
 */
router.get('/category/:category', (req, res) => {
  try {
    const { category } = req.params;
    const params = configService.getAll(category);
    
    res.json({
      success: true,
      data: params,
      category
    });
  } catch (err) {
    console.error('[Settings API] Error fetching category:', err.message);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch category parameters'
    });
  }
});

module.exports = router;
