# 🚀 Guide de Déploiement Rapide - Serveur Existant

## ⚠️ Contexte
- Serveur Nginx **déjà configuré** (pas d'accès root)
- SSL **déjà installé**
- Ancienne version déjà déployée
- Vous pouvez **uniquement copier des fichiers**

---

## ❌ Erreur Actuelle

```
Le chargement du module à l'adresse « https://dev.codeonline-edi.net/src/main.tsx » 
a été bloqué en raison d'un type MIME interdit
```

**Cause** : Vous avez copié les fichiers **source** (`src/`) au lieu des fichiers **buildés** (`dist/`)

---

## ✅ Solution en 3 Étapes

### Étape 1 : Builder l'Application en Local

```bash
# Sur votre machine locale
cd /Users/majdhakim/Travail/netconsulting/Codeonline-InfoTn

# Installer les dépendances (si nécessaire)
npm install

# Builder pour la production
npm run build
```

**Résultat attendu** :
```
✓ built in 15s
dist/index.html                   0.50 kB
dist/assets/index-abc123.js     450.23 kB
dist/assets/index-abc123.css     25.45 kB
```

### Étape 2 : Identifier le Répertoire sur le Serveur

Le serveur Nginx pointe vers un répertoire spécifique. Vous devez trouver où se trouve l'ancienne version.

**Emplacements possibles** :
- `/var/www/html/`
- `/var/www/codeonline-edi/`
- `/var/www/dev.codeonline-edi.net/`
- `/home/votre_user/public_html/`
- `/usr/share/nginx/html/`

**Comment trouver** : Regardez où se trouve l'ancienne version actuellement déployée.

### Étape 3 : Copier UNIQUEMENT le Contenu de `dist/`

**⚠️ IMPORTANT** : Copiez le **contenu** du dossier `dist/`, pas le dossier lui-même !

```bash
# Option A : Via SCP (depuis votre machine)
scp -r dist/* user@dev.codeonline-edi.net:/chemin/vers/repertoire/web/

# Option B : Via SFTP (FileZilla, WinSCP, etc.)
# 1. Connectez-vous au serveur
# 2. Naviguez vers le répertoire web
# 3. Uploadez TOUT le contenu de dist/ (pas le dossier dist lui-même)

# Option C : Via rsync (recommandé)
rsync -avz --delete dist/ user@dev.codeonline-edi.net:/chemin/vers/repertoire/web/
```

---

## 🔍 Vérifications Importantes

### 1. Vérifier que le Build a Réussi

Sur votre machine locale :
```bash
ls -la dist/

# Vous devez voir :
# - index.html
# - assets/ (avec des fichiers .js et .css)
# - Pas de dossier src/ !
```

### 2. Vérifier le Contenu de `dist/index.html`

```bash
cat dist/index.html
```

Vous devez voir quelque chose comme :
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/vite.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>CodeOnline EDI</title>
    <script type="module" crossorigin src="/assets/index-abc123.js"></script>
    <link rel="stylesheet" crossorigin href="/assets/index-abc123.css">
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>
```

**❌ Si vous voyez** `<script type="module" src="/src/main.tsx">` → **Le build n'a pas été fait !**

### 3. Vérifier sur le Serveur

Après avoir copié les fichiers, vérifiez sur le serveur :

```bash
# Se connecter au serveur
ssh user@dev.codeonline-edi.net

# Lister les fichiers
ls -la /chemin/vers/repertoire/web/

# Vous devez voir :
# - index.html
# - assets/
# - PAS de dossier src/ !
# - PAS de fichiers .tsx !

# Vérifier le contenu de index.html
cat /chemin/vers/repertoire/web/index.html
```

---

## 🗂️ Structure Attendue sur le Serveur

```
/var/www/codeonline-edi/  (ou autre répertoire)
├── index.html              ✅ Fichier HTML principal
├── assets/
│   ├── index-[hash].js    ✅ JavaScript compilé
│   ├── index-[hash].css   ✅ CSS compilé
│   └── [autres assets]
├── vite.svg               ✅ (optionnel)
└── [autres fichiers statiques]

❌ PAS de dossier src/
❌ PAS de fichiers .tsx
❌ PAS de node_modules/
❌ PAS de package.json
```

---

## 🔧 Cas Particuliers

### Si le Backend est dans le Même Répertoire

Si l'ancienne structure était :
```
/var/www/Edi-dev/
├── backend/          ← Backend Node.js (à garder)
├── frontend/         ← Ancien frontend (à remplacer)
└── Modeles/          ← Fichiers (à garder)
```

Alors copiez `dist/` vers `/var/www/Edi-dev/frontend/` :
```bash
rsync -avz --delete dist/ user@dev.codeonline-edi.net:/var/www/Edi-dev/frontend/
```

### Si Nginx Pointe vers un Sous-dossier

Exemple : Nginx configuré avec `root /var/www/html/app;`

Copiez vers ce sous-dossier :
```bash
rsync -avz --delete dist/ user@dev.codeonline-edi.net:/var/www/html/app/
```

---

## 🧪 Test Après Déploiement

### 1. Ouvrir le Navigateur

```
https://dev.codeonline-edi.net
```

### 2. Ouvrir la Console (F12)

**✅ Succès** : Pas d'erreurs, application se charge

**❌ Erreur MIME** : Vous avez encore copié les mauvais fichiers

**❌ 404** : Le chemin de déploiement est incorrect

### 3. Vérifier les Fichiers Chargés

Dans l'onglet **Network** (F12), vous devez voir :
- ✅ `index.html` - Status 200
- ✅ `assets/index-[hash].js` - Status 200 - Type: `application/javascript`
- ✅ `assets/index-[hash].css` - Status 200 - Type: `text/css`

**❌ Si vous voyez** : `src/main.tsx` - Type: `text/plain` → **Mauvais fichiers copiés !**

---

## 🐛 Dépannage

### Problème 1 : Toujours l'erreur MIME

**Cause** : Vous avez copié le dossier `dist/` au lieu de son contenu

**Solution** :
```bash
# ❌ MAUVAIS
scp -r dist user@server:/var/www/html/
# Résultat : /var/www/html/dist/index.html (chemin incorrect)

# ✅ BON
scp -r dist/* user@server:/var/www/html/
# Résultat : /var/www/html/index.html (chemin correct)
```

### Problème 2 : Page blanche

**Cause** : Chemins des assets incorrects

**Solution** : Vérifier `vite.config.ts` - ajouter `base: '/'` si nécessaire

### Problème 3 : API ne répond pas

**Cause** : Backend non démarré ou mauvaise configuration

**Solution** :
```bash
# Vérifier si le backend tourne
ps aux | grep node

# Si PM2 est installé
pm2 status

# Redémarrer si nécessaire (si vous avez les droits)
pm2 restart codeonline-backend
```

---

## 📋 Checklist Rapide

- [ ] `npm run build` exécuté en local
- [ ] Dossier `dist/` créé avec `index.html` et `assets/`
- [ ] Pas de référence à `src/main.tsx` dans `dist/index.html`
- [ ] Répertoire de destination identifié sur le serveur
- [ ] Contenu de `dist/` copié (pas le dossier lui-même)
- [ ] Fichiers vérifiés sur le serveur (pas de dossier `src/`)
- [ ] Test navigateur : https://dev.codeonline-edi.net
- [ ] Console navigateur : pas d'erreur MIME
- [ ] Network tab : fichiers `.js` et `.css` chargés avec succès

---

## 🎯 Commandes Essentielles

```bash
# 1. BUILD LOCAL
cd /Users/majdhakim/Travail/netconsulting/Codeonline-InfoTn
npm run build

# 2. VÉRIFIER LE BUILD
ls -la dist/
cat dist/index.html | grep "src="

# 3. COPIER SUR LE SERVEUR (adapter le chemin)
rsync -avz --delete dist/ user@dev.codeonline-edi.net:/var/www/html/

# 4. VÉRIFIER SUR LE SERVEUR
ssh user@dev.codeonline-edi.net "ls -la /var/www/html/"
```

---

## 💡 Astuce : Script de Déploiement Simplifié

Créez `deploy-simple.sh` :

```bash
#!/bin/bash

# Configuration
SERVER="user@dev.codeonline-edi.net"
REMOTE_PATH="/var/www/html"  # ← À ADAPTER selon votre serveur

echo "🔨 Building..."
npm run build || exit 1

echo "📤 Uploading..."
rsync -avz --delete dist/ $SERVER:$REMOTE_PATH/

echo "✅ Done! Visit: https://dev.codeonline-edi.net"
```

Utilisation :
```bash
chmod +x deploy-simple.sh
./deploy-simple.sh
```

---

## ❓ Questions à Poser à l'Administrateur Serveur

Si vous ne trouvez pas le bon répertoire :

1. **Où se trouve le répertoire web ?**
   - Quel est le chemin complet ?
   - Exemple : `/var/www/html/` ou `/home/user/public_html/`

2. **Quelle est la configuration Nginx ?**
   - Quelle directive `root` est utilisée ?
   - Y a-t-il un sous-dossier spécifique ?

3. **Ai-je les permissions d'écriture ?**
   - Puis-je copier des fichiers dans ce répertoire ?
   - Dois-je utiliser un utilisateur spécifique ?

---

**Date de création** : 5 février 2025  
**Contexte** : Serveur Nginx existant, pas d'accès root, déploiement par copie de fichiers
