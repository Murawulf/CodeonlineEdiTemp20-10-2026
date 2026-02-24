# ⚡ Déploiement Rapide - Actions Immédiates

## 🎯 Votre Situation

- ✅ Serveur Nginx déjà configuré
- ✅ SSL déjà installé  
- ✅ Ancienne version déjà déployée
- ❌ Pas d'accès root/sudo
- ❌ Erreur : fichiers `.tsx` chargés au lieu des fichiers buildés

---

## 🚨 LE PROBLÈME

Vous avez copié les **fichiers source** (dossier `src/`) au lieu des **fichiers buildés** (dossier `dist/`).

---

## ✅ LA SOLUTION (3 commandes)

### 1️⃣ Builder l'Application

```bash
cd /Users/majdhakim/Travail/netconsulting/Codeonline-InfoTn
npm run build
```

**Vérification** :
```bash
ls -la dist/
# Vous devez voir : index.html, assets/
# Vous NE devez PAS voir : src/, node_modules/, package.json
```

### 2️⃣ Trouver le Répertoire sur le Serveur

Connectez-vous au serveur et trouvez où se trouve l'ancienne version :

```bash
ssh votre_user@dev.codeonline-edi.net

# Chercher les fichiers web
find /var/www -name "index.html" 2>/dev/null
find /home -name "index.html" 2>/dev/null

# Emplacements courants :
ls -la /var/www/html/
ls -la /var/www/codeonline-edi/
ls -la /var/www/Edi-dev/frontend/
ls -la ~/public_html/
```

**Notez le chemin trouvé** : `___________________________`

### 3️⃣ Copier les Fichiers Buildés

**⚠️ IMPORTANT** : Copiez le **CONTENU** de `dist/`, pas le dossier lui-même !

```bash
# Remplacez /CHEMIN/TROUVE par le chemin identifié à l'étape 2
rsync -avz --delete dist/ votre_user@dev.codeonline-edi.net:/CHEMIN/TROUVE/
```

**Exemple concret** :
```bash
# Si le chemin est /var/www/html/
rsync -avz --delete dist/ user@dev.codeonline-edi.net:/var/www/html/

# Si le chemin est /var/www/Edi-dev/frontend/
rsync -avz --delete dist/ user@dev.codeonline-edi.net:/var/www/Edi-dev/frontend/
```

---

## 🧪 Vérification

### Sur le Serveur

```bash
ssh votre_user@dev.codeonline-edi.net

# Vérifier les fichiers (remplacez /CHEMIN/TROUVE)
ls -la /CHEMIN/TROUVE/

# Vous devez voir :
# ✅ index.html
# ✅ assets/ (avec des fichiers .js et .css)
# ❌ PAS de dossier src/
# ❌ PAS de fichiers .tsx

# Vérifier le contenu de index.html
cat /CHEMIN/TROUVE/index.html | grep "src="

# Vous devez voir : src="/assets/index-abc123.js"
# Vous NE devez PAS voir : src="/src/main.tsx"
```

### Dans le Navigateur

1. Ouvrir : https://dev.codeonline-edi.net
2. Appuyer sur **F12** (Console développeur)
3. Onglet **Network**

**✅ Succès** : Vous voyez des fichiers comme `index-abc123.js` avec Status 200

**❌ Erreur** : Vous voyez `main.tsx` avec erreur MIME → Recommencer l'étape 3

---

## 🔧 Dépannage Express

### Erreur : "Permission denied"

```bash
# Vérifier vos permissions
ssh votre_user@dev.codeonline-edi.net "ls -la /CHEMIN/TROUVE/"

# Si vous n'avez pas les droits, contactez l'admin serveur
```

### Erreur : "No such file or directory"

Le chemin de destination est incorrect. Retournez à l'étape 2 pour trouver le bon chemin.

### Toujours l'erreur MIME

Vous avez probablement copié le dossier `dist/` au lieu de son contenu :

```bash
# ❌ MAUVAIS (crée /var/www/html/dist/index.html)
rsync -avz dist user@server:/var/www/html/

# ✅ BON (crée /var/www/html/index.html)
rsync -avz dist/ user@server:/var/www/html/
```

**Notez le `/` après `dist` !**

---

## 📞 Questions pour l'Admin Serveur

Si vous ne trouvez pas le bon répertoire, demandez :

1. **Quel est le chemin du répertoire web ?**
   - Exemple : `/var/www/html/` ou `/home/user/public_html/`

2. **Quelle est la directive `root` dans la config Nginx ?**
   - Regarder dans `/etc/nginx/sites-enabled/`

3. **Ai-je les permissions d'écriture sur ce répertoire ?**

---

## 📋 Checklist Ultra-Rapide

```bash
# 1. BUILD
cd /Users/majdhakim/Travail/netconsulting/Codeonline-InfoTn
npm run build

# 2. VÉRIFIER
ls dist/index.html  # Doit exister
cat dist/index.html | grep "main.tsx"  # Ne doit RIEN afficher

# 3. COPIER (adapter le chemin)
rsync -avz --delete dist/ user@dev.codeonline-edi.net:/var/www/html/

# 4. TESTER
# Ouvrir https://dev.codeonline-edi.net
# F12 → Console → Pas d'erreur MIME
```

---

## 💡 Astuce : Créer un Alias

Ajoutez dans votre `~/.bashrc` ou `~/.zshrc` :

```bash
alias deploy-edi='cd /Users/majdhakim/Travail/netconsulting/Codeonline-InfoTn && npm run build && rsync -avz --delete dist/ user@dev.codeonline-edi.net:/var/www/html/'
```

Ensuite, déployez en une commande :
```bash
deploy-edi
```

---

**🎯 L'essentiel** : `npm run build` → copier `dist/` (avec le `/`) → vérifier qu'il n'y a plus de fichiers `.tsx` sur le serveur.
