/**
 * EDI Worker Configuration
 * Configuration centralisée pour le worker de traitement des transmissions EDI
 */

module.exports = {
  // Intervalles de traitement (en millisecondes)
  intervals: {
    outbound: 30000,      // 30 secondes - Traitement des messages sortants
    inbound: 45000,       // 45 secondes - Traitement des messages entrants
    cleanup: 3600000,     // 1 heure - Nettoyage des anciennes transmissions
  },

  // Configuration des retries
  retry: {
    maxAttempts: 5,       // Nombre maximum de tentatives
    backoffMultiplier: 2, // Multiplicateur pour le délai entre tentatives (exponentiel)
    initialDelay: 60000,  // Délai initial avant première retry (1 minute)
    maxDelay: 3600000,    // Délai maximum entre retries (1 heure)
  },

  // Configuration des timeouts
  timeouts: {
    httpRequest: 30000,   // Timeout pour les requêtes HTTP (30 secondes)
    processing: 120000,   // Timeout pour le traitement d'un message (2 minutes)
  },

  // Statuts à traiter
  statuses: {
    outbound: {
      toProcess: ['PENDING', 'ERROR'],  // Statuts à traiter pour OUTBOUND
      finalStates: ['SENT', 'ACKNOWLEDGED'], // Statuts finaux (ne plus traiter)
    },
    inbound: {
      toProcess: ['RECEIVED'],          // Statuts à traiter pour INBOUND
      finalStates: ['PROCESSED', 'ACKNOWLEDGED'], // Statuts finaux
    },
  },

  // Configuration du nettoyage
  cleanup: {
    enabled: true,
    retentionDays: {
      success: 90,        // Conserver les transmissions réussies pendant 90 jours
      error: 180,         // Conserver les transmissions en erreur pendant 180 jours
    },
  },

  // Configuration des serveurs EDI externes
  ediServers: {
    default: {
      // Utilise le préfixe LOCAL_API_URL depuis le .env, ou construit dynamiquement avec le PORT (5001 ou 5000)
      // Le suffixe /api/edi/receive reste fixe.
      url: `${process.env.LOCAL_API_URL || `http://localhost:${process.env.PORT || 5000}`}/api/edi/receive`,
      apiPin: process.env.API_PIN || '3311',
    },
    // Possibilité d'ajouter d'autres serveurs
    // senegal: {
    //   url: 'https://codeonline-edi.net/api/edi/receive',
    //   apiPin: 'XXXXX',
    // },
  },

  // Configuration du logging
  logging: {
    enabled: true,
    verbose: true,        // Mode verbeux pour debug
    logToFile: false,     // Écrire les logs dans un fichier
    logFilePath: './logs/edi_worker.log',
  },

  // Limites de traitement par cycle
  limits: {
    outboundBatchSize: 10,  // Nombre max de messages OUTBOUND à traiter par cycle
    inboundBatchSize: 10,   // Nombre max de messages INBOUND à traiter par cycle
  },

  // Mode de démarrage
  startup: {
    autoStart: true,        // Démarrer automatiquement le worker au lancement du serveur
    processOnStartup: false, // Traiter immédiatement au démarrage (sinon attendre le premier intervalle)
  },
};
