# 🛠️ Corrections Configuration Serveur

## 1. Pourquoi le port du fichier `.env` était ignoré ?
PM2 injecte les variables d'environnement définies dans `ecosystem.config.cjs` au démarrage du processus. Ces variables ont la priorité sur celles chargées par `dotenv` à l'intérieur de l'application.
**Correction effectuée :** J'ai retiré la ligne `PORT: 5000` de la configuration de production dans `ecosystem.config.cjs`. Désormais, c'est la valeur dans votre fichier `.env` qui sera utilisée.

## 2. Correction de l'erreur de Base de Données (ECONNREFUSED)
L'erreur `connect ECONNREFUSED 91.134.35.126:3306` indique que la base de données refuse la connexion sur l'IP publique.
**Solution :** Comme le backend et la base de données sont sur le même serveur, il faut utiliser l'interface locale (`127.0.0.1` ou `localhost`).

## 3. Correction du Conflit de Port (EADDRINUSE)
Le port 5000 est déjà occupé. Il faut passer au port 5001.

---

## 🚀 Actions à effectuer sur le SERVEUR

Connectez-vous à votre serveur et éditez le fichier `.env` :

```bash
nano /var/www/Edi-dev/backend/.env
```

Modifiez ces deux lignes :

```ini
# 1. Utiliser l'IP locale pour la base de données
DB_HOST=127.0.0.1

# 2. Changer le port pour éviter le conflit (5000 est pris)
PORT=5001
LOCAL_API_URL=http://localhost:5001
```

Sauvegardez (`Ctrl+O`, `Enter`) et quittez (`Ctrl+X`).

---

## 🔄 Appliquer les changements

Une fois le fichier `.env` modifié sur le serveur :

1. **Mettre à jour la configuration PM2** (si vous avez déployé le nouveau fichier `ecosystem.config.cjs`) :
   Si vous ne l'avez pas encore envoyé sur le serveur, copiez-le ou modifiez-le sur place pour qu'il ressemble à ça (sans le PORT dans `env`) :
   ```javascript
   env: {
     NODE_ENV: 'production'
     // PORT: 5000  <-- Cette ligne doit être supprimée !
   },
   ```

2. **Redémarrer PM2 :**
   ```bash
   # Important : delete pour effacer l'ancienne config en mémoire
   pm2 delete codeonline-edi-backend
   
   # Redémarrer avec la nouvelle config
   pm2 start ecosystem.config.cjs --env production
   ```

3. **Vérifier :**
   ```bash
   pm2 logs codeonline-edi-backend --lines 20
   ```
   Vous devriez voir :
   - ✅ Database connection successful
   - ✅ Server running on port 5001
