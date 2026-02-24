# 🔧 Instructions de Correction - Serveur Sénégal

## 📋 Problèmes identifiés

Après votre déploiement, plusieurs erreurs sont apparues :
1. ❌ **Drapeau incorrect** : Affiche "Tunisie" au lieu de "Sénégal"
2. ❌ **404 sur `/api/edi/suppliers/TN` et `/api/edi/suppliers/SN`**
3. ❌ **404 sur `/api/settings`** (malgré le correctif précédent)
4. ❌ **500/404 sur `/api/orders/incoming` et `/api/orders/sent`**
5. ❌ **Erreurs WebSocket** (wss://dev.codeonline-edi.net/socket.io/)
6. ❌ **Erreurs CORS** avec le serveur Tunisie

## 🎯 Cause racine

La configuration de la base de données du serveur Sénégal est incorrecte. Les paramètres `CURRENT_INSTANCE_CODE` et `LOCAL_API_URL` dans la table `app_parameters` ne sont pas correctement définis, ce qui fait que le serveur s'identifie comme "Tunisie" au lieu de "Sénégal".

---

## 🛠️ ÉTAPE 1 : Correction de la base de données

### 1.1 Transférer le script SQL sur le serveur

```bash
# Depuis votre machine locale
scp -P 22 fix_senegal_config.sql Consultant@91.134.35.126:/tmp/
```

### 1.2 Se connecter au serveur Sénégal

```bash
ssh -p 22 Consultant@91.134.35.126
```

### 1.3 Exécuter le script SQL

```bash
# Sur le serveur Sénégal
mysql -u consultant_seg -p Dev_Entitedb < /tmp/fix_senegal_config.sql
```

**Mot de passe** : `49BD&4vyrK6=PT!`

### 1.4 Vérifier les résultats

Le script affichera automatiquement :
- ✅ Les valeurs **AVANT** correction
- ✅ Les valeurs **APRÈS** correction

Vous devriez voir :
```
CURRENT_INSTANCE_CODE = 'SEN' ✅
LOCAL_API_URL = 'https://dev.codeonline-edi.net' ✅
NETWORK_TOPOLOGY contient 'tunisia' et 'senegal' ✅
```

---

## 🔄 ÉTAPE 2 : Redémarrer PM2

```bash
# Toujours sur le serveur Sénégal
pm2 restart codeonline-edi-senegal
pm2 logs codeonline-edi-senegal --lines 50
```

**Vérifiez les logs** pour confirmer :
```
[ConfigService] 🌍 Hydrating topology for instance: 'SEN'
[ConfigService] ✅ Initialized with XX parameters
```

---

## 🚀 ÉTAPE 3 : Redéployer le backend (optionnel mais recommandé)

Pour appliquer tous les correctifs de routes :

```bash
# Depuis votre machine locale
cd /Users/majdhakim/Travail/netconsulting/Codeonline-InfoTn
./deploy_senegal.sh
```

---

## 🌐 ÉTAPE 4 : Vider le cache du navigateur

1. Ouvrez votre navigateur sur `https://dev.codeonline-edi.net`
2. Appuyez sur **Ctrl+Shift+R** (ou **Cmd+Shift+R** sur Mac)
3. Rechargez complètement la page

---

## ✅ ÉTAPE 5 : Vérifications post-correction

### 5.1 Vérifier le drapeau
- Le drapeau dans la barre supérieure doit afficher **Sénégal** 🇸🇳
- La liste des pays doit afficher "**Sénégal (Local)**"

### 5.2 Vérifier les API

Ouvrez la console du navigateur (F12) et vérifiez :

```
✅ GET https://dev.codeonline-edi.net/api/settings → 200 OK
✅ GET https://dev.codeonline-edi.net/api/edi/suppliers/SN → 200 OK
✅ GET https://dev.codeonline-edi.net/api/orders/incoming → 200 OK
```

### 5.3 Vérifier les logs du serveur

```bash
# Sur le serveur
pm2 logs codeonline-edi-senegal --lines 100
```

Recherchez :
```
[ConfigService] 🌍 Hydrating topology for instance: 'SEN'
[ConfigService] ✅ Initialized with XX parameters
```

---

## 🆘 Si des problèmes persistent

### Problème : 404 sur `/api/settings`

**Cause** : Les routes ne sont pas dans le bon ordre dans `server.js`

**Solution** : Le correctif a déjà été appliqué. Assurez-vous de redéployer (Étape 3).

### Problème : Erreurs CORS avec Tunisie

**Cause** : Le frontend essaie de contacter directement le serveur Tunisie

**Solution** : Après avoir corrigé `CURRENT_INSTANCE_CODE`, le frontend utilisera le proxy local au lieu d'appeler directement la Tunisie.

### Problème : WebSocket ne se connecte pas

**Cause** : Configuration Apache manquante pour WebSocket

**Solution** : Vérifiez que votre configuration Apache inclut :
```apache
ProxyPass /socket.io/ http://localhost:5001/socket.io/
ProxyPassReverse /socket.io/ http://localhost:5001/socket.io/
```

---

## 📞 Support

Si après avoir suivi toutes ces étapes, des problèmes persistent, fournissez-moi :

1. **Les logs PM2** :
   ```bash
   pm2 logs codeonline-edi-senegal --lines 100
   ```

2. **Les logs de la console navigateur** (F12 → Console)

3. **Le résultat de la requête SQL** :
   ```sql
   SELECT param_key, LEFT(param_value, 100) as param_value
   FROM app_parameters 
   WHERE param_key IN ('CURRENT_INSTANCE_CODE', 'LOCAL_API_URL', 'NETWORK_TOPOLOGY');
   ```

---

## 📝 Résumé des fichiers modifiés

- ✅ `backend/server.js` : Ordre des routes corrigé, certicode réactivé
- ✅ `src/pages/Login.tsx` : Envoi du certicode pour tous les utilisateurs
- ✅ `ecosystem.senegal.config.cjs` : `DB_HOST=127.0.0.1` ajouté
- ✅ `deploy_senegal.sh` : Déploiement à la racine, exclusion `.env`
- ✅ `fix_senegal_config.sql` : Script de correction BDD (nouveau)

---

**Date de création** : 16 février 2026  
**Version** : 1.0
