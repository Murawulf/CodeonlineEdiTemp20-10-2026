const { spawn } = require('child_process');
const path = require('path');

const SERVER_PATH = path.join(__dirname, '../server.js');

function startServer(name, env, color) {
    console.log(`${color}[${name}] Starting on PORT ${env.PORT}...${'\x1b[0m'}`);
    
    const server = spawn('node', [SERVER_PATH], {
        env: { ...process.env, ...env },
        stdio: 'pipe'
    });

    server.stdout.on('data', (data) => {
        const lines = data.toString().split('\n');
        lines.forEach(line => {
            if (line.trim()) console.log(`${color}[${name}] ${line.trim()}${'\x1b[0m'}`);
        });
    });

    server.stderr.on('data', (data) => {
        console.error(`${color}[${name}] ERROR: ${data.toString().trim()}${'\x1b[0m'}`);
    });

    server.on('close', (code) => {
        console.log(`${color}[${name}] Exited with code ${code}${'\x1b[0m'}`);
    });

    return server;
}

// 1. Tunisia Server (Local DB - SQLite Fallback)
const tunisiaEnv = {
    PORT: '5005',
    MY_GLN: '6191234567890',
    DB_HOST: '', // Force SQLite
    ENTITE_DB_PATH: path.join(__dirname, '../data/tunisia.db'),
    ENABLE_P2P_WORKERS: 'true',
};

// 2. Senegal Server (Local DB - SQLite Fallback for isolation)
const senegalEnv = {
    PORT: '5002',
    MY_GLN: 'SN02583102G3',
    DB_HOST: '', // Force SQLite
    ENTITE_DB_PATH: path.join(__dirname, '../data/senegal.db'),
    KEYS_DIR: path.join(__dirname, '../temp_keys/senegal'), // Use Senegal's keys
};

// 3. Orchestrator Server (Port 5010)
const orchestratorEnv = {
    PORT: '5010',
    MY_GLN: 'ORCHESTRATOR',
    DB_HOST: '', // Force SQLite
    ENTITE_DB_PATH: path.join(__dirname, '../data/orchestrator.db'),
    ENABLE_P2P_WORKERS: 'false' // Orchestrator doesn't run EDI workers
};

console.log('--- Starting E2E Test Servers ---');

const tunisiaServer = startServer('TUNISIA', tunisiaEnv, '\x1b[32m'); // Green
const senegalServer = startServer('SENEGAL', senegalEnv, '\x1b[33m'); // Yellow

let orchestratorServer;
if (!process.argv.includes('--no-orchestrator')) {
    orchestratorServer = startServer('ORCHESTRATOR', orchestratorEnv, '\x1b[35m'); // Magenta
} else {
    console.log('⚠️  Skipping Orchestrator (P2P Fallback Mode)');
}

// Handle exit
process.on('SIGINT', () => {
    console.log('\nStopping servers...');
    tunisiaServer.kill();
    senegalServer.kill();
    if (orchestratorServer) orchestratorServer.kill();
    process.exit();
});
