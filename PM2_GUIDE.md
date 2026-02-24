# Guide PM2 pour le Backend Codeonline-EDI

## 📋 Table des Matières
1. [Installation PM2](#installation-pm2)
2. [Configuration PM2](#configuration-pm2)
3. [Commandes Essentielles](#commandes-essentielles)
4. [Différences : Start vs Restart vs Reload](#différences-start-vs-restart-vs-reload)
5. [Monitoring et Logs](#monitoring-et-logs)
6. [Déploiement et Mise à Jour](#déploiement-et-mise-à-jour)
7. [Troubleshooting](#troubleshooting)

---

## 🚀 Installation PM2

### Installer PM2 globalement
```bash
npm install -g pm2
```

### Vérifier l'installation
```bash
pm2 --version
```

---

## ⚙️ Configuration PM2

### Créer un fichier de configuration `ecosystem.config.js`

Créez ce fichier à la racine du projet :

```javascript
module.exports = {
  apps: [{
    name: 'codeonline-edi-backend',
    script: './backend/server.js',
    cwd: '/Users/majdhakim/Travail/netconsulting/Codeonline-InfoTn',
    instances: 1,
    exec_mode: 'fork',
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      PORT: 5001
    },
    env_development: {
      NODE_ENV: 'development',
      PORT: 5001
    },
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    autorestart: true,
    max_restarts: 10,
    min_uptime: '10s',
    listen_timeout: 3000,
    kill_timeout: 5000
  }]
};
```

### Créer le dossier logs
```bash
mkdir -p logs
```

---

## 🎯 Commandes Essentielles

### 1. **START** - Démarrer l'application

#### Première fois (avec fichier de config)
```bash
pm2 start ecosystem.config.js
```

#### Ou directement
```bash
pm2 start backend/server.js --name codeonline-edi-backend
```

#### En mode développement
```bash
pm2 start ecosystem.config.js --env development
```

#### En mode production
```bash
pm2 start ecosystem.config.js --env production
```

---

### 2. **STOP** - Arrêter l'application

```bash
# Arrêter par nom
pm2 stop codeonline-edi-backend

# Arrêter par ID
pm2 stop 0

# Arrêter toutes les apps
pm2 stop all
```

---

### 3. **RESTART** - Redémarrer l'application

```bash
# Redémarrer par nom
pm2 restart codeonline-edi-backend

# Redémarrer par ID
pm2 restart 0

# Redémarrer toutes les apps
pm2 restart all
```

**⚠️ RESTART = STOP + START (downtime de quelques secondes)**

---

### 4. **RELOAD** - Rechargement sans downtime

```bash
# Reload par nom
pm2 reload codeonline-edi-backend

# Reload par ID
pm2 reload 0

# Reload toutes les apps
pm2 reload all
```

**✅ RELOAD = Zero-downtime restart (recommandé pour la production)**

---

### 5. **DELETE** - Supprimer du registre PM2

```bash
# Supprimer par nom
pm2 delete codeonline-edi-backend

# Supprimer par ID
pm2 delete 0

# Supprimer toutes les apps
pm2 delete all
```

---

## 🔄 Différences : Start vs Restart vs Reload

| Commande | Usage | Downtime | Quand l'utiliser |
|----------|-------|----------|------------------|
| **start** | Démarre une nouvelle instance | N/A | Première fois ou après `delete` |
| **restart** | Arrête puis redémarre | ✅ Oui (2-5s) | Changements de config, variables d'env |
| **reload** | Redémarre sans coupure | ❌ Non | Mise à jour du code en production |
| **stop** | Arrête l'application | ✅ Oui | Maintenance, debugging |

### Cas d'Usage Détaillés

#### Utiliser **START** quand :
- C'est la première fois que vous lancez l'app
- Vous avez fait `pm2 delete` et voulez relancer
- Vous testez une nouvelle configuration

#### Utiliser **RESTART** quand :
- Vous avez modifié les variables d'environnement
- Vous avez changé `ecosystem.config.js`
- Vous voulez forcer un redémarrage complet
- Vous êtes en développement/test

#### Utiliser **RELOAD** quand :
- Vous déployez du nouveau code en production
- Vous voulez éviter toute interruption de service
- Vous avez des utilisateurs connectés
- **C'est la méthode recommandée pour les mises à jour en production**

---

## 📊 Monitoring et Logs

### Voir le statut de toutes les apps
```bash
pm2 status
```

ou

```bash
pm2 list
```

### Voir les détails d'une app
```bash
pm2 show codeonline-edi-backend
```

### Voir les logs en temps réel
```bash
# Tous les logs
pm2 logs

# Logs d'une app spécifique
pm2 logs codeonline-edi-backend

# Dernières 100 lignes
pm2 logs codeonline-edi-backend --lines 100

# Seulement les erreurs
pm2 logs codeonline-edi-backend --err

# Seulement les sorties standard
pm2 logs codeonline-edi-backend --out
```

### Vider les logs
```bash
pm2 flush
```

### Monitoring en temps réel
```bash
pm2 monit
```

### Dashboard web (optionnel)
```bash
pm2 plus
```

---

## 🚀 Déploiement et Mise à Jour

### Procédure Complète de Mise à Jour

#### 1. **Récupérer le nouveau code**
```bash
cd /Users/majdhakim/Travail/netconsulting/Codeonline-InfoTn
git pull origin main
```

#### 2. **Installer les nouvelles dépendances**
```bash
cd backend
npm install
```

#### 3. **Appliquer les migrations SQL (si nécessaire)**
```bash
# Se connecter à MySQL et exécuter les migrations
mysql -u root -p codeonline_edi < sql/migrations/votre_migration.sql
```

#### 4. **Recharger l'application SANS downtime**
```bash
pm2 reload codeonline-edi-backend
```

#### 5. **Vérifier que tout fonctionne**
```bash
pm2 logs codeonline-edi-backend --lines 50
```

### Procédure avec Changement de Configuration

Si vous modifiez `ecosystem.config.js` ou les variables d'environnement :

```bash
# 1. Arrêter l'app
pm2 stop codeonline-edi-backend

# 2. Supprimer du registre
pm2 delete codeonline-edi-backend

# 3. Redémarrer avec la nouvelle config
pm2 start ecosystem.config.js --env production

# 4. Sauvegarder la configuration
pm2 save
```

---

## 💾 Sauvegarde et Démarrage Automatique

### Sauvegarder la configuration actuelle
```bash
pm2 save
```

### Configurer le démarrage automatique au boot
```bash
# Générer le script de démarrage
pm2 startup

# Exécuter la commande affichée (exemple pour macOS/Linux)
# sudo env PATH=$PATH:/usr/local/bin pm2 startup systemd -u majdhakim --hp /Users/majdhakim

# Sauvegarder la liste des apps
pm2 save
```

### Désactiver le démarrage automatique
```bash
pm2 unstartup
```

---

## 🔍 Troubleshooting

### Erreur ERR_REQUIRE_ESM avec ecosystem.config.js

**Symptôme :**
```
Error [ERR_REQUIRE_ESM]: require() of ES Module ecosystem.config.js not supported.
ecosystem.config.js is treated as an ES module file...
```

**Cause :**
Votre `package.json` contient `"type": "module"`, ce qui traite tous les fichiers `.js` comme des modules ES. PM2 utilise `require()` (CommonJS) pour charger la configuration.

**Solution 1 : Renommer en .cjs (RECOMMANDÉ)**
```bash
# Renommer le fichier
mv ecosystem.config.js ecosystem.config.cjs

# Démarrer avec le nouveau nom
pm2 start ecosystem.config.cjs --env production
```

**Solution 2 : Supprimer "type": "module" du package.json**
```json
{
  "name": "votre-app",
  // Supprimer ou commenter cette ligne :
  // "type": "module",
  ...
}
```

**Note :** La solution 1 est préférable car elle n'affecte pas le reste de votre application.

---

### L'application ne démarre pas

```bash
# Voir les logs d'erreur
pm2 logs codeonline-edi-backend --err --lines 100

# Vérifier le statut
pm2 status

# Voir les détails complets
pm2 show codeonline-edi-backend
```

### L'application redémarre en boucle

```bash
# Vérifier les logs
pm2 logs codeonline-edi-backend

# Augmenter le min_uptime dans ecosystem.config.js
# min_uptime: '30s'

# Redémarrer avec la nouvelle config
pm2 restart codeonline-edi-backend --update-env
```

### Problème de port déjà utilisé

```bash
# Vérifier quel processus utilise le port 5001
lsof -i :5001

# Arrêter PM2
pm2 stop all

# Tuer le processus si nécessaire
kill -9 <PID>

# Redémarrer
pm2 start ecosystem.config.js
```

### Mémoire insuffisante

```bash
# Voir l'utilisation mémoire
pm2 monit

# Redémarrer pour libérer la mémoire
pm2 restart codeonline-edi-backend

# Ajuster max_memory_restart dans ecosystem.config.js
# max_memory_restart: '2G'
```

### Réinitialiser complètement PM2

```bash
# Arrêter toutes les apps
pm2 stop all

# Supprimer toutes les apps
pm2 delete all

# Tuer le daemon PM2
pm2 kill

# Redémarrer proprement
pm2 start ecosystem.config.js
pm2 save
```

---

## 📝 Commandes Rapides - Cheat Sheet

```bash
# Démarrage
pm2 start ecosystem.config.js                    # Démarrer avec config
pm2 start backend/server.js --name mon-app       # Démarrer directement

# Gestion
pm2 stop mon-app                                 # Arrêter
pm2 restart mon-app                              # Redémarrer (avec downtime)
pm2 reload mon-app                               # Recharger (sans downtime)
pm2 delete mon-app                               # Supprimer

# Monitoring
pm2 list                                         # Liste des apps
pm2 status                                       # Statut
pm2 logs                                         # Logs en temps réel
pm2 logs mon-app --lines 100                     # 100 dernières lignes
pm2 monit                                        # Dashboard temps réel
pm2 show mon-app                                 # Détails complets

# Maintenance
pm2 save                                         # Sauvegarder la config
pm2 resurrect                                    # Restaurer les apps sauvegardées
pm2 flush                                        # Vider les logs
pm2 reset mon-app                                # Reset les compteurs

# Système
pm2 startup                                      # Config démarrage auto
pm2 unstartup                                    # Désactiver démarrage auto
pm2 kill                                         # Tuer le daemon PM2
pm2 update                                       # Mettre à jour PM2
```

---

## 🎯 Workflow Recommandé pour Codeonline-EDI

### Développement Local
```bash
# Démarrer en mode dev
pm2 start ecosystem.config.js --env development

# Voir les logs
pm2 logs codeonline-edi-backend
```

### Production (Serveur)
```bash
# Première installation
pm2 start ecosystem.config.js --env production
pm2 save
pm2 startup

# Mise à jour du code
git pull origin main
cd backend && npm install
pm2 reload codeonline-edi-backend

# Vérification
pm2 logs codeonline-edi-backend --lines 50
pm2 status
```

### Changement de Configuration
```bash
# Modifier ecosystem.config.js ou .env
pm2 restart codeonline-edi-backend --update-env
pm2 save
```

---

## ✅ Checklist de Déploiement

- [ ] Code récupéré (`git pull`)
- [ ] Dépendances installées (`npm install`)
- [ ] Migrations SQL appliquées (si nécessaire)
- [ ] Variables d'environnement vérifiées
- [ ] `pm2 reload` exécuté (ou `restart` si changement de config)
- [ ] Logs vérifiés (`pm2 logs`)
- [ ] Statut vérifié (`pm2 status`)
- [ ] Configuration sauvegardée (`pm2 save`)
- [ ] Tests fonctionnels effectués

---

**Date de création :** 9 février 2026  
**Version PM2 recommandée :** 5.x ou supérieure  
**Application :** Codeonline-EDI Backend (Node.js/Express)
