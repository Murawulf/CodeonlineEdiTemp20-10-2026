// ============================================================================
// PM2 ecosystem — Codeonline EDI Orchestrator (PAESN Registry)
// ----------------------------------------------------------------------------
// Structural config only. NO secrets here.
// DB credentials, API_PIN, JWT_SECRET and TRACKING_API_KEY live in .env
// (loaded by server.js via dotenv) and are git-ignored.
//
// Per-environment values (PM2 name, port, log dir) are overridable via ORCH_*
// env vars set by deploy/deploy_orchestrator.sh. Defaults below = DEV.
// ============================================================================
const path = require('path');

const PM2_NAME = process.env.ORCH_PM2_NAME || 'codeonline-edi-orchestrator';
const PORT     = process.env.ORCH_PORT     || 5010;
const LOG_DIR  = process.env.ORCH_LOG_DIR  || path.join(__dirname, 'logs');

module.exports = {
  apps: [{
    name: PM2_NAME,
    script: './server.js',
    cwd: __dirname,
    instances: 1,
    exec_mode: 'fork',
    watch: false,
    max_memory_restart: '500M',
    env: {
      NODE_ENV: 'production',
      PORT: PORT
      // DB_HOST, DB_USER, DB_PASSWORD, DB_NAME, API_PIN, JWT_SECRET,
      // TRACKING_API_KEY → provided by .env (dotenv), never committed.
    },
    error_file: path.join(LOG_DIR, `${PM2_NAME}-error.log`),
    out_file:   path.join(LOG_DIR, `${PM2_NAME}-out.log`),
    merge_logs: true,
    autorestart: true
  }]
};
