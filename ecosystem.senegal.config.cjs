module.exports = {
  apps: [{
    name: 'codeonline-edi-senegal',
    script: './server.js',
    cwd: '/var/www/Edi-dev/backend',
    instances: 1,
    exec_mode: 'fork',
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      PORT: 5001,
      DB_HOST: '127.0.0.1', // Force l'utilisation de la BDD locale sur le serveur
      // Ajoutez ici d'autres variables d'environnement si nécessaire
    },
    error_file: '/var/www/Edi-dev/logs/pm2-error.log',
    out_file: '/var/www/Edi-dev/logs/pm2-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    autorestart: true,
    max_restarts: 10,
    min_uptime: '10s'
  }]
};
