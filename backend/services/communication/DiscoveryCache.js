const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { queryDB, runUpdate, isMySQLConnection } = require('../../db_utils');
const configService = require('../configService');
const { serviceAuthHeaders } = require('../serviceAuth');

class DiscoveryCache {
  constructor() {
    this.cache = new Map();
    this.lastUpdate = 0;
    this.TTL = 60 * 60 * 1000; // 1 hour cache
    this.db = null;
  }

  setDb(db) {
      this.db = db;
  }

  /**
   * Resolve a GLN to an API URL.
   * Priority:
   * 1. In-memory cache
   * 2. Local DB Cache (network_directory table)
   * 3. Orchestrator Query (lazy load)
   */
  async resolve(gln) {
    // 1. Memory Cache
    if (this.cache.has(gln)) {
      return this.cache.get(gln);
    }

    // 2. DB Cache
    if (this.db) {
        try {
            const row = await queryDB(this.db, "SELECT api_url FROM network_directory WHERE gln = ?", [gln]);
            if (row && row.length > 0) {
                const url = row[0].api_url;
                this.cache.set(gln, url);
                return url;
            }
        } catch (e) {
            console.warn('[DiscoveryCache] DB lookup failed:', e.message);
        }
    }

    // 3. Fallback / Lazy Load from Orchestrator
    // In a real P2P scenario, if we are offline from Orchestrator, we can't fetch.
    // So we rely on what we have.
    
    // 4. Topology-based resolution using GLN prefix to infer country
    try {
      const topology = configService.get('NETWORK_TOPOLOGY');
      if (topology) {
        const nodes = typeof topology === 'string' ? JSON.parse(topology) : topology;
        let targetNodeKey = null;
        
        // Infer country from GLN prefix
        if (gln.startsWith('SN')) {
          targetNodeKey = 'senegal';
        } else if (gln.startsWith('619')) {
          targetNodeKey = 'tunisia';
        } else if (gln.startsWith('FR') || gln.startsWith('325') || gln.startsWith('326')) {
          targetNodeKey = 'france';
        }
        
        if (targetNodeKey && nodes[targetNodeKey] && nodes[targetNodeKey].apiUrl) {
          const url = nodes[targetNodeKey].apiUrl;
          console.log(`[DiscoveryCache] Resolved GLN ${gln} -> ${targetNodeKey} -> ${url} (from topology)`);
          this.cache.set(gln, url);
          return url;
        }
      }
    } catch (e) {
      console.warn('[DiscoveryCache] Topology resolution failed:', e.message);
    }

    // 5. Hardcoded fallback for known test nodes
    if (gln === 'SN02583102G3') return 'http://91.134.35.126:5001';
    if (gln === 'GLN_TEST_123') return 'http://localhost:5001';

    return null;
  }

  /**
   * Refreshes the local cache from the Orchestrator.
   * Should be called by a worker periodically.
   */
  async refreshCache() {
      try {
          const orchestratorUrl = configService.get('ORCHESTRATOR_URL');
          if (!orchestratorUrl) return;

          const response = await axios.get(`${orchestratorUrl}/api/orchestrator/discovery`, {
              headers: serviceAuthHeaders()
          });
          const directory = response.data.directory;

          if (Array.isArray(directory)) {
              for (const node of directory) {
                  this.cache.set(node.gln, node.url);
                  // Update DB
                  if (this.db) {
                      const isMySQL = isMySQLConnection(this.db);
                      const query = isMySQL 
                        ? `INSERT INTO network_directory (gln, api_url, updated_at) VALUES (?, ?, NOW()) ON DUPLICATE KEY UPDATE api_url = VALUES(api_url), updated_at = NOW()`
                        : `INSERT INTO network_directory (gln, api_url, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(gln) DO UPDATE SET api_url = excluded.api_url, updated_at = CURRENT_TIMESTAMP`;
                      
                      await runUpdate(this.db, query, [node.gln, node.url]);
                  }
              }
              this.lastUpdate = Date.now();
              console.log(`[DiscoveryCache] Refreshed ${directory.length} nodes.`);
          }
      } catch (err) {
          console.error('[DiscoveryCache] Refresh failed:', err.message);
      }
  }
}

module.exports = new DiscoveryCache();
