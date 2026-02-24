# Installation WebSocket pour mise à jour en temps réel

## Modifications effectuées

### 1. Backend (Node.js/Express)

✅ **Ajout de Socket.IO au serveur**
- Installation de `socket.io` dans le backend
- Configuration du serveur HTTP avec Socket.IO
- Export global de l'instance `io` pour utilisation dans les workers

✅ **Modification du Worker EDI**
- Émission d'événements WebSocket lors du changement de statut de commande
- Événement `order:status:updated` émis quand une commande passe de 'new' à 'sent'

### 2. Frontend (React/TypeScript)

✅ **Ajout de Socket.IO Client**
- Import de `socket.io-client` dans le composant Order
- Connexion automatique au serveur WebSocket
- Écoute des événements de mise à jour de statut
- Mise à jour automatique de l'UI sans rechargement de page

## Installation des dépendances

### Backend
```bash
cd backend
npm install socket.io
```

### Frontend
```bash
cd ..
npm install socket.io-client
```

## Fonctionnement

1. **Création de commande** : Statut initial = `'new'`
2. **Worker EDI traite la commande** : Envoi via EDI
3. **Envoi réussi** : 
   - Statut mis à jour à `'sent'` dans la base de données
   - Événement WebSocket émis : `order:status:updated`
4. **Frontend reçoit l'événement** :
   - Mise à jour automatique du statut dans la liste
   - Notification toast affichée à l'utilisateur
   - Aucun rechargement de page nécessaire

## Événements WebSocket

### `order:status:updated`
```typescript
{
  orderId: number,      // ID de la commande
  status: string,       // Nouveau statut ('sent', 'new', etc.)
  timestamp: string     // Date/heure de la mise à jour
}
```

## Tests

1. Créer une nouvelle commande
2. Observer le statut initial "new" dans l'interface
3. Attendre que le worker EDI traite la commande (intervalle configuré)
4. Observer la mise à jour automatique du statut à "sent" sans recharger la page
5. Vérifier la notification toast

## Configuration

Le serveur WebSocket écoute sur le même port que l'API backend (5001 par défaut).

Pour modifier l'URL de connexion WebSocket, éditer :
`src/pages/operation-edi/Order.tsx` ligne 155
```typescript
const socketInstance = io('http://localhost:5001', {
  // ...
});
```
