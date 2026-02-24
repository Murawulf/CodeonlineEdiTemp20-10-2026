# 🇸🇳 Guide de Déploiement - Serveur Sénégal (Mise à Jour)

Ce guide détaille les étapes pour mettre à jour l'application CodeOnline EDI sur le serveur Sénégal.
**Important :** Nous déployons directement dans le dossier existant `/var/www/Edi-dev` car la configuration Apache ne peut pas être modifiée.

## 🚀 Procédure de Déploiement Automatisée

Le script `deploy_senegal.sh` automatise tout le processus de manière sécurisée.

### 1. Préparation Locale

Assurez-vous d'avoir configuré l'accès SSH dans le script `deploy_senegal.sh` :
```bash
REMOTE_USER="root"          # Votre utilisateur SSH
REMOTE_HOST="dev.codeonline-edi.net" # IP ou domaine du serveur
```

### 2. Lancer le Déploiement

Depuis votre terminal local (Mac) :
```bash
./deploy_senegal.sh
```

**Ce que fait le script :**
1. ✅ **Build** le Frontend React (Vite) localement.
2. ✅ **Connecte** au serveur via SSH.
3. ✅ **Sauvegarde** l'état actuel du serveur dans `/var/www/Edi-dev/_BACKUPS/` (au cas où).
4. ✅ **Met à jour** le dossier `dist` (Frontend) et `backend` (Node.js).
   - *Note :* Il préserve intelligemment vos dossiers `uploads`, `Modeles` et votre fichier `.env`.
5. ✅ **Transfère** la configuration PM2 optimisée.
6. ✅ **Installe** les dépendances et **Redémarre** le service backend.

---

## ⚙️ Configuration Post-Déploiement (Premier déploiement uniquement)

Si c'est la toute première fois que vous déployez cette version :

### 1. Vérifier le fichier .env

Le script ne touche pas à votre fichier `.env` s'il existe déjà. S'il n'existait pas, un fichier vide a été créé.
Connectez-vous pour le configurer :

```bash
ssh root@dev.codeonline-edi.net
nano /var/www/Edi-dev/backend/.env
```

Assurez-vous qu'il contient les bonnes informations pour le Sénégal :
```ini
# Configuration SÉNÉGAL
PORT=5001
CURRENT_INSTANCE_CODE=SEN
# ... autres configs BDD ...
```

Puis redémarrez le backend pour prendre en compte les changements :
```bash
pm2 restart codeonline-edi-senegal
```

### 2. Vérifier que tout tourne

```bash
# Vérifier les logs du backend
pm2 logs codeonline-edi-senegal

# Vérifier que le dossier dist contient bien les fichiers
ls -la /var/www/Edi-dev/dist
```

---

## 🛠 En cas de problème

### Restauration d'un backup

Le script crée automatiquement des backups datés avant chaque déploiement dans `/var/www/Edi-dev/_BACKUPS/`.
Pour restaurer une version précédente :

```bash
cd /var/www/Edi-dev
# Exemple pour restaurer le backend d'une date précise
cp -r _BACKUPS/backend_20260213_230000/* backend/
pm2 restart codeonline-edi-senegal
```

### Le site ne s'affiche pas ?

Vérifiez que Apache pointe bien vers le dossier `dist` :
```bash
cat /etc/apache2/sites-enabled/000-default.conf | grep DocumentRoot
# Devrait afficher : DocumentRoot /var/www/Edi-dev/dist
```
(Si ce n'est pas le cas, c'est que la config Apache est différente de ce qui était prévu, contactez l'admin serveur).
