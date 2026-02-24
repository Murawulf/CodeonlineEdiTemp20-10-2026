# EDI Worker - Documentation

## Vue d'ensemble

Le **EDI Worker** est un système de traitement asynchrone des transmissions EDI (Electronic Data Interchange). Il gère automatiquement l'envoi des messages sortants (OUTBOUND) et le traitement des messages entrants (INBOUND) stockés dans la table `edi_transmissions`.

## Architecture

```
backend/
├── config/
│   └── edi_worker_config.js      # Configuration centralisée
├── workers/
│   └── edi_worker.js              # Worker principal
├── routes/
│   └── edi_worker_routes.js       # API de gestion/monitoring
└── server.js                      # Intégration au serveur
```

## Fonctionnalités

### 1. Traitement OUTBOUND (Envoi)
- Récupère les transmissions avec statut `PENDING` ou `ERROR`
- Envoie les messages EANCOM aux serveurs EDI externes
- Gère les retries avec backoff exponentiel
- Met à jour les statuts (`SENT`, `ERROR`)

### 2. Traitement INBOUND (Réception)
- Récupère les transmissions avec statut `RECEIVED`
- Parse les messages EANCOM
- Traite les messages selon leur type (ORDERS, ORDRSP, DESADV, INVOIC)
- Met à jour les statuts (`PROCESSED`, `ERROR`)

### 3. Nettoyage Automatique
- Supprime les anciennes transmissions réussies (90 jours par défaut)
- Supprime les anciennes transmissions en erreur (180 jours par défaut)

### 4. Système de Retry
- Maximum 5 tentatives par défaut
- Backoff exponentiel (1min, 2min, 4min, 8min, 16min)
- Délai maximum de 1 heure entre tentatives

## Configuration

### Fichier: `config/edi_worker_config.js`

```javascript
module.exports = {
  // Intervalles de traitement
  intervals: {
    outbound: 30000,      // 30 secondes
    inbound: 45000,       // 45 secondes
    cleanup: 3600000,     // 1 heure
  },

  // Configuration des retries
  retry: {
    maxAttempts: 5,
    backoffMultiplier: 2,
    initialDelay: 60000,  // 1 minute
    maxDelay: 3600000,    // 1 heure
  },

  // Limites par cycle
  limits: {
    outboundBatchSize: 10,
    inboundBatchSize: 10,
  },

  // Démarrage automatique
  startup: {
    autoStart: true,
    processOnStartup: false,
  },
};
```

### Paramètres Modifiables

| Paramètre | Description | Valeur par défaut |
|-----------|-------------|-------------------|
| `intervals.outbound` | Intervalle de traitement OUTBOUND (ms) | 30000 (30s) |
| `intervals.inbound` | Intervalle de traitement INBOUND (ms) | 45000 (45s) |
| `intervals.cleanup` | Intervalle de nettoyage (ms) | 3600000 (1h) |
| `retry.maxAttempts` | Nombre max de tentatives | 5 |
| `retry.initialDelay` | Délai initial avant retry (ms) | 60000 (1min) |
| `limits.outboundBatchSize` | Messages OUTBOUND par cycle | 10 |
| `limits.inboundBatchSize` | Messages INBOUND par cycle | 10 |
| `cleanup.retentionDays.success` | Rétention transmissions réussies (jours) | 90 |
| `cleanup.retentionDays.error` | Rétention transmissions en erreur (jours) | 180 |

## API de Gestion

### Obtenir le statut du worker

```bash
GET /api/edi-worker/status
```

**Réponse:**
```json
{
  "isRunning": true,
  "stats": {
    "outbound": { "processed": 42, "success": 40, "errors": 2 },
    "inbound": { "processed": 15, "success": 15, "errors": 0 },
    "lastRun": {
      "outbound": "2026-01-16T15:30:00.000Z",
      "inbound": "2026-01-16T15:30:15.000Z",
      "cleanup": "2026-01-16T14:00:00.000Z"
    }
  },
  "config": {
    "intervals": { "outbound": 30000, "inbound": 45000, "cleanup": 3600000 },
    "retry": { "maxAttempts": 5, "initialDelay": 60000, "maxDelay": 3600000 },
    "limits": { "outboundBatchSize": 10, "inboundBatchSize": 10 }
  }
}
```

### Démarrer le worker manuellement

```bash
POST /api/edi-worker/start
```

### Arrêter le worker manuellement

```bash
POST /api/edi-worker/stop
```

### Forcer un cycle de traitement immédiat

```bash
POST /api/edi-worker/process-now
Content-Type: application/json

{
  "direction": "both"  // "outbound", "inbound", ou "both"
}
```

### Forcer un nettoyage immédiat

```bash
POST /api/edi-worker/cleanup-now
```

## Flux de Traitement

### OUTBOUND (Envoi)

```
1. Récupération des transmissions (status: PENDING ou ERROR)
   ↓
2. Vérification du délai de retry (si retry_count > 0)
   ↓
3. Envoi HTTP POST vers serveur EDI externe
   ↓
4. Succès → status = SENT, transmission_date = NOW()
   Échec → status = ERROR, retry_count++
   ↓
5. Si retry_count >= maxAttempts → Arrêt des tentatives
```

### INBOUND (Réception)

```
1. Récupération des transmissions (status: RECEIVED)
   ↓
2. Parse du message EANCOM
   ↓
3. Traitement selon le type de message:
   - ORDERS → Création de commande
   - ORDRSP → Mise à jour statut commande
   - DESADV → Création avis d'expédition
   - INVOIC → Création facture
   ↓
4. Succès → status = PROCESSED, processing_date = NOW()
   Échec → status = ERROR, retry_count++
```

## Logs

Le worker génère des logs détaillés pour chaque opération:

```
[EDI WORKER] 🚀 Starting EDI Worker...
[EDI WORKER] ✅ EDI Worker started successfully
[EDI WORKER]    - Outbound interval: 30s
[EDI WORKER]    - Inbound interval: 45s
[EDI WORKER]    - Cleanup interval: 3600s

[EDI WORKER] [OUTBOUND] Processing 3 transmission(s)...
[EDI WORKER] [OUTBOUND] ✅ Transmission #42 sent successfully
[EDI WORKER] [OUTBOUND] ❌ Transmission #43 failed: Connection timeout
[EDI WORKER] [OUTBOUND] Cycle completed in 1250ms

[EDI WORKER] [INBOUND] Processing 2 transmission(s)...
[EDI WORKER] [INBOUND] ✅ Transmission #15 processed successfully
[EDI WORKER] [INBOUND] Cycle completed in 890ms

[EDI WORKER] [CLEANUP] Deleted 12 success + 3 error transmissions (45ms)
```

## Mode Verbeux

Pour activer les logs détaillés, modifier la configuration:

```javascript
logging: {
  enabled: true,
  verbose: true,  // Active les logs détaillés
}
```

## Monitoring

### Vérifier l'état du worker

```bash
curl http://localhost:5001/api/edi-worker/status
```

### Surveiller les logs en temps réel

```bash
tail -f logs/server.log | grep "EDI WORKER"
```

### Requêtes SQL utiles

**Transmissions en attente:**
```sql
SELECT * FROM edi_transmissions 
WHERE direction = 'OUTBOUND' 
  AND status IN ('PENDING', 'ERROR')
  AND retry_count < 5
ORDER BY created_at;
```

**Transmissions en erreur:**
```sql
SELECT id, document_type, status, retry_count, error_message, created_at
FROM edi_transmissions 
WHERE status = 'ERROR'
ORDER BY created_at DESC;
```

**Statistiques par statut:**
```sql
SELECT direction, status, COUNT(*) as count
FROM edi_transmissions
GROUP BY direction, status;
```

## Dépannage

### Le worker ne démarre pas

1. Vérifier la configuration: `config/edi_worker_config.js`
2. Vérifier que `autoStart: true`
3. Vérifier les logs au démarrage du serveur

### Les messages ne sont pas envoyés

1. Vérifier le statut: `GET /api/edi-worker/status`
2. Vérifier les transmissions: `SELECT * FROM edi_transmissions WHERE status = 'ERROR'`
3. Vérifier l'URL du serveur EDI dans la config
4. Vérifier le PIN API

### Les retries ne fonctionnent pas

1. Vérifier `retry_count < maxAttempts`
2. Vérifier le délai de retry (backoff exponentiel)
3. Forcer un traitement: `POST /api/edi-worker/process-now`

### Performances dégradées

1. Réduire `outboundBatchSize` et `inboundBatchSize`
2. Augmenter les intervalles de traitement
3. Activer le nettoyage automatique

## Arrêt Gracieux

Le worker s'arrête proprement lors de l'arrêt du serveur:

```bash
# CTRL+C ou kill
SIGINT received, shutting down gracefully...
[EDI WORKER] 🛑 Stopping EDI Worker...
[EDI WORKER] ✅ EDI Worker stopped
```

## Évolutions Futures

- [ ] Support multi-serveurs EDI (routage par partenaire)
- [ ] Webhooks pour notifications en temps réel
- [ ] Dashboard de monitoring visuel
- [ ] Métriques Prometheus/Grafana
- [ ] Support des messages APERAK (accusés de réception)
- [ ] Traitement parallèle des transmissions
- [ ] File d'attente prioritaire (messages urgents)

## Support

Pour toute question ou problème, consulter:
- Les logs du serveur
- L'API de statut: `/api/edi-worker/status`
- La table `edi_transmissions` dans la base de données
