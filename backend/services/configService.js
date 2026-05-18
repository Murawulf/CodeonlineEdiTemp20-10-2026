/**
 * Configuration Service
 * =====================
 * 
 * Service centralisé pour la gestion des paramètres globaux de l'application.
 * Charge les paramètres depuis la table app_parameters au démarrage du serveur
 * et les met en cache pour un accès rapide.
 * 
 * @module services/configService
 */

// In-memory cache for parameters
let configCache = {};
let isInitialized = false;
let dbConnection = null;

/**
 * Initialize the config service with a database connection
 * @param {Object} db - Database connection (MySQL wrapper or pool)
 */
const initialize = async (db) => {
  dbConnection = db;
  await loadAllParameters();
  isInitialized = true;
  console.log('[ConfigService] ✅ Initialized with', Object.keys(configCache).length, 'parameters');
};

/**
 * Load all parameters from database into cache
 */
const loadAllParameters = async () => {
  if (!dbConnection) {
    console.warn('[ConfigService] No database connection available');
    return;
  }

  try {
    let rows;
    if (dbConnection.__isMysql) {
      rows = await dbConnection.all('SELECT * FROM app_parameters', []);
    } else if (typeof dbConnection.query === 'function') {
      const [result] = await dbConnection.execute('SELECT * FROM app_parameters', []);
      rows = result;
    } else {
      // SQLite fallback
      rows = await new Promise((resolve, reject) => {
        dbConnection.all('SELECT * FROM app_parameters', [], (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      });
    }

    // Clear and rebuild cache
    configCache = {};
    for (const row of rows) {
      configCache[row.param_key] = {
        value: parseValue(row.param_value, row.param_type),
        rawValue: row.param_value,
        type: row.param_type,
        category: row.category,
        description: row.description,
        isPublic: row.is_public === 1
      };
    }

    // --- Environment Variable Overrides (Crucial for Local Dev with Remote DB) ---
    if (process.env.LOCAL_API_URL) {
      if (!configCache['LOCAL_API_URL']) {
        configCache['LOCAL_API_URL'] = { type: 'string', isPublic: true, value: process.env.LOCAL_API_URL };
      } else {
        configCache['LOCAL_API_URL'].value = process.env.LOCAL_API_URL;
      }
      console.log(`[ConfigService] 🔧 Overriding LOCAL_API_URL with env: ${process.env.LOCAL_API_URL}`);
    }

    if (process.env.MY_GLN) {
      if (!configCache['MY_GLN']) {
        configCache['MY_GLN'] = { type: 'string', isPublic: true, value: process.env.MY_GLN };
      } else {
        configCache['MY_GLN'].value = process.env.MY_GLN;
      }
      console.log(`[ConfigService] 🔧 Overriding MY_GLN with env: ${process.env.MY_GLN}`);
    }

    if (process.env.CURRENT_INSTANCE_CODE) {
      if (!configCache['CURRENT_INSTANCE_CODE']) {
        configCache['CURRENT_INSTANCE_CODE'] = { type: 'string', isPublic: true, value: process.env.CURRENT_INSTANCE_CODE };
      } else {
        configCache['CURRENT_INSTANCE_CODE'].value = process.env.CURRENT_INSTANCE_CODE;
      }
      console.log(`[ConfigService] 🔧 Overriding CURRENT_INSTANCE_CODE with env: ${process.env.CURRENT_INSTANCE_CODE}`);
    }

    // --- Dynamic Configuration Hydration ---
    // Override/Set URLs based on Topology and Current Instance
    hydrateFromTopology();

    console.log('[ConfigService] Loaded parameters:', Object.keys(configCache));
  } catch (err) {
    console.error('[ConfigService] Failed to load parameters:', err.message);
    // Initialize with defaults if table doesn't exist
    initializeDefaults();
  }
};

/**
 * Hydrate cache with derived values from Network Topology
 */
const hydrateFromTopology = () => {
  const topology = get('NETWORK_TOPOLOGY');
  const currentInstance = get('CURRENT_INSTANCE_CODE');
  const localUrl = get('LOCAL_API_URL', 'http://localhost:5000');

  if (topology && currentInstance) {
    console.log(`[ConfigService] 🌍 Hydrating topology for instance: '${currentInstance}'`);
    
    // Parse topology if it's a string (should be object if parsed by parseValue)
    const nodes = typeof topology === 'string' ? JSON.parse(topology) : topology;

    // Check for mock override
    const mockRemoteNodes = process.env.MOCK_REMOTE_NODES === 'true';
    if (mockRemoteNodes) {
      console.log('[ConfigService] ⚠️ MOCK_REMOTE_NODES is enabled: All remote EDI URLs will point to local server');
    }

    Object.entries(nodes).forEach(([nodeCode, nodeConfig]) => {
      const isMe = String(nodeCode).trim().toLowerCase() === String(currentInstance).trim().toLowerCase();
      
      // Determine effective URLs
      // If I am this node, use my local URL. Otherwise use the public topology URL.
      const effectiveApiUrl = isMe ? localUrl : nodeConfig.apiUrl;
      
      let effectiveEdiUrl;
      if (isMe) {
        effectiveEdiUrl = `${localUrl}/api/edi/receive`;
      } else if (mockRemoteNodes) {
        effectiveEdiUrl = `${localUrl}/api/edi/receive`; // Mock: send to self
      } else {
        effectiveEdiUrl = nodeConfig.ediUrl;
      }

      // Inject into config cache (Virtual Parameters)
      // These keys can be used by the rest of the app as if they were in the DB
      const apiParamKey = `API_URL_${nodeCode.toUpperCase()}`;
      const ediParamKey = `EDI_URL_${nodeCode.toUpperCase()}`;

      configCache[apiParamKey] = {
        value: effectiveApiUrl,
        type: 'string',
        isPublic: true,
        description: `Derived API URL for ${nodeConfig.name} (${isMe ? 'Local' : 'Remote'})`
      };

      configCache[ediParamKey] = {
        value: effectiveEdiUrl,
        type: 'string',
        isPublic: true,
        description: `Derived EDI URL for ${nodeConfig.name} (${isMe ? 'Local' : 'Remote'})`
      };
    });
  }
};

/**
 * Parse value based on type
 */
const parseValue = (value, type) => {
  switch (type) {
    case 'number':
      return Number(value);
    case 'boolean':
      return value === 'true' || value === '1';
    case 'json':
      try {
        return typeof value === 'object' ? value : JSON.parse(value);
      } catch {
        return value;
      }
    default:
      return value;
  }
};

/**
 * Initialize with default values (fallback)
 */
const initializeDefaults = () => {
  // Parse topology from env (NETWORK_TOPOLOGY_JSON). If missing, topology is empty;
  // country URLs must then be provided explicitly via app_parameters DB or env.
  let topologyFromEnv = {};
  if (process.env.NETWORK_TOPOLOGY_JSON) {
    try {
      topologyFromEnv = JSON.parse(process.env.NETWORK_TOPOLOGY_JSON);
    } catch (e) {
      console.warn('[ConfigService] ⚠️ Invalid NETWORK_TOPOLOGY_JSON env var:', e.message);
    }
  }

  configCache = {
    LOCAL_API_URL: { value: process.env.LOCAL_API_URL || 'http://localhost:5000', type: 'string', isPublic: true },
    CURRENT_INSTANCE_CODE: { value: process.env.CURRENT_INSTANCE_CODE || 'local_dev', type: 'string', isPublic: true },
    NETWORK_TOPOLOGY: { value: topologyFromEnv, type: 'json', isPublic: true },
    WEBSOCKET_URL: { value: process.env.LOCAL_API_URL || 'http://localhost:5000', type: 'string', isPublic: true },
    API_PIN: { value: process.env.API_PIN || '3311', type: 'string', isPublic: false },
    API_TIMEOUT: { value: 30000, type: 'number', isPublic: true },
    APP_NAME: { value: 'CodeOnline EDI', type: 'string', isPublic: true },
    DEFAULT_CURRENCY: { value: 'TND', type: 'string', isPublic: true },
    DEFAULT_LANGUAGE: { value: 'fr', type: 'string', isPublic: true },
    DEFAULT_PAGE_SIZE: { value: 20, type: 'number', isPublic: true },
  };

  // --- Environment Variable Overrides (Crucial for Local Dev with Remote DB) ---
  if (process.env.LOCAL_API_URL) {
    if (!configCache['LOCAL_API_URL']) {
      configCache['LOCAL_API_URL'] = { type: 'string', isPublic: true, value: process.env.LOCAL_API_URL };
    } else {
      configCache['LOCAL_API_URL'].value = process.env.LOCAL_API_URL;
    }
    console.log(`[ConfigService] 🔧 Overriding LOCAL_API_URL with env: ${process.env.LOCAL_API_URL}`);
  }

  if (process.env.MY_GLN) {
    if (!configCache['MY_GLN']) {
      configCache['MY_GLN'] = { type: 'string', isPublic: true, value: process.env.MY_GLN };
    } else {
      configCache['MY_GLN'].value = process.env.MY_GLN;
    }
    console.log(`[ConfigService] 🔧 Overriding MY_GLN with env: ${process.env.MY_GLN}`);
  }

  if (process.env.CURRENT_INSTANCE_CODE) {
    if (!configCache['CURRENT_INSTANCE_CODE']) {
      configCache['CURRENT_INSTANCE_CODE'] = { type: 'string', isPublic: true, value: process.env.CURRENT_INSTANCE_CODE };
    } else {
      configCache['CURRENT_INSTANCE_CODE'].value = process.env.CURRENT_INSTANCE_CODE;
    }
    console.log(`[ConfigService] 🔧 Overriding CURRENT_INSTANCE_CODE with env: ${process.env.CURRENT_INSTANCE_CODE}`);
  }
  
  // Hydrate defaults too
  hydrateFromTopology();
  console.log('[ConfigService] Using default parameters');
};

/**
 * Get a single parameter value
 * @param {string} key - Parameter key
 * @param {*} defaultValue - Default value if not found
 * @returns {*} Parameter value
 */
const get = (key, defaultValue = null) => {
  const param = configCache[key];
  return param ? param.value : defaultValue;
};

/**
 * Get all parameters (optionally filtered by category)
 * @param {string} category - Optional category filter
 * @returns {Object} Parameters object
 */
const getAll = (category = null) => {
  if (!category) {
    return Object.fromEntries(
      Object.entries(configCache).map(([key, param]) => [key, param.value])
    );
  }
  return Object.fromEntries(
    Object.entries(configCache)
      .filter(([_, param]) => param.category === category)
      .map(([key, param]) => [key, param.value])
  );
};

/**
 * Get all public parameters (safe to expose to frontend)
 * @returns {Object} Public parameters
 */
const getPublicConfig = () => {
  return Object.fromEntries(
    Object.entries(configCache)
      .filter(([_, param]) => param.isPublic)
      .map(([key, param]) => [key, param.value])
  );
};

/**
 * Get server URLs configuration
 * @returns {Object} Server URLs
 */
const getServerUrls = () => {
  const localUrl = get('LOCAL_API_URL', 'http://localhost:5000');

  // All country URLs come from the hydrated NETWORK_TOPOLOGY (app_parameters DB).
  // Fallback is the local URL — never a hardcoded remote domain.
  return {
    buyer: get('API_URL_BUYER', localUrl),       // Legacy support
    supplier: get('API_URL_SUPPLIER', localUrl), // Legacy support
    senegal: get('API_URL_SENEGAL', localUrl),
    tunisia: get('API_URL_TUNISIA', localUrl),
    websocket: get('WEBSOCKET_URL', localUrl),
  };
};

/**
 * Get API URL for a specific country/node
 * @param {string} countryCode - 'tunisia' or 'senegal'
 * @returns {string} The resolved API URL
 */
const getCountryApiUrl = (countryCode) => {
  if (!countryCode) return get('LOCAL_API_URL');
  return get(`API_URL_${countryCode.toUpperCase()}`);
};

/**
 * Get EDI URL for a specific country/node
 * @param {string} countryCode - 'tunisia' or 'senegal'
 * @returns {string} The resolved EDI URL
 */
const getCountryEdiUrl = (countryCode) => {
  if (!countryCode) return `${get('LOCAL_API_URL')}/api/edi/receive`;
  return get(`EDI_URL_${countryCode.toUpperCase()}`);
};

/**
 * Get EDI target URL for a partner based on their GLN
 * This function queries the database to find the partner's country,
 * then uses NETWORK_TOPOLOGY to determine the correct EDI endpoint.
 * 
 * @param {Object} db - Database connection
 * @param {string} partnerGln - GLN of the target partner
 * @returns {Promise<Object>} { url: string, countryCode: string, countryName: string }
 */
const getEdiTargetUrl = async (db, partnerGln) => {
  if (!partnerGln) {
    throw new Error('Partner GLN is required for EDI routing');
  }

    // 0. Check for Central EDI Orchestrator (Hub)
    // If a Hub URL is configured, we route ALL outbound EDI traffic through it.
    // The Hub handles country resolution and dispatching.
    const hubUrl = get('EDI_HUB_URL');
    if (hubUrl) {
      console.log(`[ConfigService] 🚀 Routing EDI via Orchestrator: ${partnerGln} -> ${hubUrl}`);
      return {
        url: hubUrl,
        countryCode: 'HUB',
        countryName: 'EDI Orchestrator'
      };
    }

    try {
      // Query partner's country from database
    let partnerInfo;
    try {
      if (db.__isMysql) {
        // Use generic query helper if available or direct driver
        // Assuming db is a connection pool or connection
         const [rows] = await db.execute('SELECT pays FROM Entite WHERE gln = ? LIMIT 1', [partnerGln]);
         partnerInfo = rows;
      } else if (typeof db.query === 'function') {
         // Generic wrapper support
         const result = await db.query('SELECT pays FROM Entite WHERE gln = ? LIMIT 1', [partnerGln]);
         partnerInfo = Array.isArray(result) ? result : [result];
      } else {
        // SQLite fallback (for tests/dev)
        partnerInfo = await new Promise((resolve, reject) => {
          db.all('SELECT pays FROM Entite WHERE gln = ? LIMIT 1', [partnerGln], (err, rows) => {
            if (err) resolve([]); // Resolve empty on error to trigger fallback
            else resolve(rows);
          });
        });
      }
    } catch (dbErr) {
      console.warn(`[ConfigService] DB lookup failed for GLN ${partnerGln}: ${dbErr.message}. Proceeding to prefix fallback.`);
      partnerInfo = [];
    }

    let partnerCountry = null;

    if (partnerInfo && partnerInfo.length > 0 && partnerInfo[0].pays) {
      partnerCountry = partnerInfo[0].pays;
    } else {
      // FALLBACK: Infer country from GLN prefix for inter-country routing
      if (partnerGln.startsWith('SN')) {
        partnerCountry = 'Senegal';
        console.log(`[ConfigService] GLN ${partnerGln} not in DB. Inferred country 'Senegal' from prefix 'SN'.`);
      } else if (partnerGln.startsWith('619')) {
        partnerCountry = 'Tunisie';
        console.log(`[ConfigService] GLN ${partnerGln} not in DB. Inferred country 'Tunisie' from prefix '619'.`);
      } else {
        console.warn(`[ConfigService] Partner GLN ${partnerGln} not found or has no country. Using local URL.`);
        return {
          url: `${get('LOCAL_API_URL')}/api/edi/receive`,
          countryCode: null,
          countryName: 'Unknown'
        };
      }
    }

    // Get NETWORK_TOPOLOGY from config
    const topology = get('NETWORK_TOPOLOGY');
    if (!topology) {
      console.warn('[ConfigService] NETWORK_TOPOLOGY not configured. Using local URL.');
      return {
        url: `${get('LOCAL_API_URL')}/api/edi/receive`,
        countryCode: null,
        countryName: partnerCountry
      };
    }

    // Parse topology if needed
    const nodes = typeof topology === 'string' ? JSON.parse(topology) : topology;

    // ISO 3166-1 numeric codes for countries in the topology (stored in Entite.pays)
    const NUMERIC_COUNTRY_MAP = {
      '788': ['tunisie', 'tunisia', 'tunis'],
      '686': ['senegal', 'sénégal', 'senegalais'],
      '250': ['france'],
      '504': ['maroc', 'morocco'],
      '012': ['algerie', 'algeria', 'algérie'],
    };

    // Normalize: if pays is a numeric code, resolve to country name aliases
    const numericAliases = NUMERIC_COUNTRY_MAP[partnerCountry.trim()] || null;

    // Find matching node by comparing country name (case-insensitive, partial match)
    let matchedNode = null;
    let matchedNodeCode = null;

    for (const [nodeCode, nodeConfig] of Object.entries(nodes)) {
      if (!nodeConfig.country) continue;
      
      const configCountry = nodeConfig.country.toLowerCase().trim();
      const partnerCountryLower = partnerCountry.toLowerCase().trim();
      
      // Match if either contains the other (handles variations like "Tunisie" vs "Tunisia")
      const nameMatch = configCountry.includes(partnerCountryLower) || partnerCountryLower.includes(configCountry);
      // Also match if the numeric code maps to this country's name/aliases
      const numericMatch = numericAliases ? numericAliases.some(alias => configCountry.includes(alias) || alias.includes(configCountry)) : false;
      
      if (nameMatch || numericMatch) {
        matchedNode = nodeConfig;
        matchedNodeCode = nodeCode;
        break;
      }
    }

    if (!matchedNode) {
      console.warn(`[ConfigService] No topology node found for country '${partnerCountry}'. Using local URL.`);
      return {
        url: `${get('LOCAL_API_URL')}/api/edi/receive`,
        countryCode: null,
        countryName: partnerCountry
      };
    }

    // Get the EDI URL for this node (already hydrated by hydrateFromTopology)
    const ediUrl = get(`EDI_URL_${matchedNodeCode.toUpperCase()}`);
    
    if (!ediUrl) {
      console.warn(`[ConfigService] EDI URL not found for node '${matchedNodeCode}'. Using local URL.`);
      return {
        url: `${get('LOCAL_API_URL')}/api/edi/receive`,
        countryCode: matchedNode.countryCode || matchedNodeCode,
        countryName: matchedNode.name || partnerCountry
      };
    }

    // Use countryCode (3 letters) if available, otherwise fallback to nodeCode
    const finalCountryCode = matchedNode.countryCode || matchedNodeCode.toUpperCase();
    
    console.log(`[ConfigService] 🎯 EDI routing: GLN ${partnerGln} -> ${matchedNode.name} (${finalCountryCode}) -> ${ediUrl}`);
    
    return {
      url: ediUrl,
      countryCode: finalCountryCode,
      countryName: matchedNode.name || partnerCountry
    };

  } catch (err) {
    console.error('[ConfigService] Error in getEdiTargetUrl:', err.message);
    // Fallback to local URL on error
    return {
      url: `${get('LOCAL_API_URL')}/api/edi/receive`,
      countryCode: null,
      countryName: 'Error',
      error: err.message
    };
  }
};

/**
 * Get EDI Orders Path (configurable storage location for EANCOM documents)
 * @returns {string} The path to the Edi-orders folder
 */
const getEdiOrdersPath = () => {
  // Try to get from database first
  const dbPath = get('EDI_ORDERS_PATH');
  if (dbPath) return dbPath;
  
  // Fallback to environment variable
  if (process.env.EDI_ORDERS_PATH) return process.env.EDI_ORDERS_PATH;
  
  // Final fallback: use uploads/edi_orders relative to the backend directory
  // This ensures the path is always within the application folder (/var/www/Edi-dev/backend/uploads/edi_orders)
  const path = require('path');
  return path.join(__dirname, '..', 'uploads', 'edi_orders');
};

/**
 * Update a parameter value

 * @param {string} key - Parameter key
 * @param {*} value - New value
 * @returns {Promise<boolean>} Success status
 */
const set = async (key, value) => {
  if (!dbConnection) {
    console.warn('[ConfigService] No database connection available');
    return false;
  }

  try {
    const stringValue = typeof value === 'object' ? JSON.stringify(value) : String(value);
    
    if (dbConnection.__isMysql) {
      await dbConnection.run(
        'UPDATE app_parameters SET param_value = ? WHERE param_key = ?',
        [stringValue, key]
      );
    } else if (typeof dbConnection.query === 'function') {
      await dbConnection.execute(
        'UPDATE app_parameters SET param_value = ? WHERE param_key = ?',
        [stringValue, key]
      );
    }

    // Update cache
    if (configCache[key]) {
      configCache[key].value = parseValue(stringValue, configCache[key].type);
      configCache[key].rawValue = stringValue;
    }

    console.log(`[ConfigService] Updated ${key} = ${stringValue}`);
    return true;
  } catch (err) {
    console.error('[ConfigService] Failed to update parameter:', err.message);
    return false;
  }
};

/**
 * Reload all parameters from database
 */
const reload = async () => {
  await loadAllParameters();
  console.log('[ConfigService] Configuration reloaded');
};

/**
 * Check if service is initialized
 */
const isReady = () => isInitialized;

module.exports = {
  initialize,
  get,
  getAll,
  getPublicConfig,
  getServerUrls,
  getCountryApiUrl,
  getCountryEdiUrl,
  getEdiTargetUrl,
  getEdiOrdersPath,
  set,
  reload,
  isReady,
};
