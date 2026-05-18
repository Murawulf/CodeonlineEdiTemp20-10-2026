# Backend `_archive/`

Ce dossier contient des anciennes variantes du serveur Node.js conservées
uniquement pour référence historique. **Aucune n'est utilisée par PM2 / le
déploiement courant.**

| Fichier | Date archivage | Raison |
|---|---|---|
| `servertunisie.js` | 2026-05-07 | Variante historique antérieure à la consolidation des pays sur `server.js` (multi-instance via `CURRENT_INSTANCE_CODE`). Référence Tunisie spécifique. |
| `server.full.restored.js` | 2026-05-07 | Snapshot d'une restauration ponctuelle. Plus à jour que `server.js`. |

**Le seul point d'entrée actif est `backend/server.js`** (référencé par
`ecosystem.config.cjs` généré dans `deploy_universal.sh`).

⚠️ Si tu as besoin de récupérer un bout de logique de ces fichiers, ouvre-les
en lecture seule, copie ce qu'il faut dans `server.js`, mais ne les remets pas
en service.
