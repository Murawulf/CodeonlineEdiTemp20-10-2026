# 🚨 RAPPORT D'AUDIT : Configuration Apache

J'ai analysé la configuration de votre serveur et j'ai trouvé la cause exacte du problème.

## ❌ L'Erreur Actuelle

Le fichier `/etc/apache2/sites-available/dev.codeonline-edi.net.conf` contient ceci :

```apache
ProxyPass /api http://localhost:5000/api
```

⚠️ **Il pointe vers le port 5000 (PROD) au lieu du port 5001 (DEV) !**

C'est pour cela que :
1. Vous avez des erreurs (conflit entre les deux applis).
2. Les WebSockets échouent (pas de config WebSocket).
3. Le SSL est mal configuré sur le sous-domaine dev.

## ✅ La Solution (Script Fourni)

Le script `setup_proxy_admin.sh` que j'ai placé dans `/tmp/` sur le serveur corrige tout cela :

1. **Change le port** : 5000 ➔ **5001**
2. **Active le SSL** : Configure correctement le certificat Let's Encrypt.
3. **Active les WebSockets** : Ajoute le support pour Socket.io.

## 📝 Action Requise

Demandez à votre administrateur système d'exécuter :

```bash
sudo bash /tmp/setup_proxy_admin.sh
```

Cela sauvegardera l'ancienne config et appliquera la bonne instantanément.
