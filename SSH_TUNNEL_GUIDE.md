# 🛡️ Solution : Tunnel SSH pour la Base de Données

L'erreur `ECONNREFUSED` confirme que le serveur distant refuse les connexions directes à la base de données (ce qui est une bonne pratique de sécurité).

Pour accéder aux données réelles depuis votre machine locale, vous devez créer un **Tunnel SSH**. Cela fait croire à votre ordinateur que la base de données distante est locale.

## 1. Lancer le Tunnel SSH

Ouvrez un **nouveau terminal** (ne fermez pas les autres) et lancez cette commande :

```bash
# Remplacez 'root' par votre utilisateur SSH si différent
ssh -L 3307:127.0.0.1:3306 root@91.134.35.126 -N
```

*   **`-L 3307:127.0.0.1:3306`** : Redirige le port local 3307 vers le port 3306 du serveur distant.
*   **`-N`** : Ne lance pas de shell distant (reste en attente).
*   On utilise le port local **3307** pour éviter les conflits si vous avez déjà un MySQL local sur le 3306.

Si la commande semble "bloquée" sans rien afficher, **c'est normal !** Cela signifie que le tunnel est ouvert. Laissez ce terminal ouvert.

## 2. Mettre à jour la configuration Backend

Je vais modifier votre fichier `backend/.env` pour passer par ce tunnel.

```ini
# Connexion via Tunnel SSH
DB_HOST=127.0.0.1
DB_PORT=3307  <-- Important : Port du tunnel
```

## 3. Redémarrer le Backend

Dans le terminal du backend :
1.  Arrêtez le serveur (`Ctrl+C`).
2.  Relancez-le (`npm start`).

---

**Résumé des terminaux ouverts :**
1.  🟦 **Tunnel SSH** (ne touchez plus)
2.  🟩 **Backend** (`npm start`)
3.  🟨 **Frontend** (`npm run dev`)
