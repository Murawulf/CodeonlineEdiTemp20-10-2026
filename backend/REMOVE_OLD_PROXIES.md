# Routes Proxy à Supprimer de server.js

Les routes suivantes ont été migrées vers `routes/api_proxy.js` et doivent être supprimées de `server.js` :

## 1. Notifications Proxy (lignes ~4744-4880)
```javascript
// ==================== NOTIFICATIONS PROXY ENDPOINT ====================
app.get('/api/proxy/notifications', ...)
app.put('/api/proxy/notifications/:id/read', ...)
app.delete('/api/proxy/notifications/:id', ...)
```

## 2. EDI Suppliers Proxy (lignes ~4647-4742)
```javascript
// ==================== EDI PROXY ENDPOINT ====================
app.get('/api/edi/suppliers/:country', ...)
```

## 3. EDI Products Proxy (lignes ~4882-4987)
```javascript
// ==================== EDI PRODUCTS PROXY ENDPOINT ====================
app.get('/api/edi/products/:country', ...)
```

## Variables à Supprimer
```javascript
let notificationsServerDown = false;
let lastNotificationError = 0;
const NOTIFICATION_ERROR_COOLDOWN = 30000;
```

Ces variables sont maintenant dans `api_proxy.js`.

## Lignes Exactes à Supprimer
- Lignes 4647-4742 : EDI Suppliers
- Lignes 4744-4880 : Notifications (GET, PUT, DELETE)
- Lignes 4882-4987 : EDI Products

Total : ~340 lignes à supprimer
