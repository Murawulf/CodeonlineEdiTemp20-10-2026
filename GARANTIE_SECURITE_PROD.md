# 🛡️ Sécurité de la Production Garantie

Rassurez-vous, **la Production ne sera absolument pas touchée.**

Apache utilise des fichiers de configuration séparés pour chaque sous-domaine. J'ai vérifié leur existence sur votre serveur :

| Environnement | URL | Port Backend | Fichier de Configuration Apache | Action du Script |
| :--- | :--- | :--- | :--- | :--- |
| **PRODUCTION** 🔴 | `codeonline-edi.net` | **5000** | `/etc/apache2/sites-available/codeonline-edi.net.conf` | **AUCUNE MODIFICATION** (Ignoré) |
| **DEV (Sénégal)** 🟢 | `dev.codeonline-edi.net` | **5001** | `/etc/apache2/sites-available/dev.codeonline-edi.net.conf` | **CORRECTION** (Cible unique) |

## 🎯 Ce que fait le script `/tmp/setup_proxy_admin.sh`

Il modifie **uniquement** le fichier `dev.codeonline-edi.net.conf`.

Actuellement, ce fichier de DEV contient une erreur :
```apache
ProxyPass /api http://localhost:5000/api  <-- ERREUR : Pointe vers la PROD !
```

Le script va corriger cette ligne pour :
```apache
ProxyPass /api http://localhost:5001/api  <-- CORRECTION : Pointe vers le DEV
```

**Conclusion :**
Vous pouvez exécuter le script sans crainte. Il est chirurgical et ne concerne que le sous-domaine de développement. La Prod continuera de tourner sur le port 5000 sans interruption.
