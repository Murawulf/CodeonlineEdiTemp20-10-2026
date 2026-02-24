# 🧪 Guide de Test Local

La configuration a été réinitialisée pour un environnement de développement local minimal.

## 📋 Configuration Actuelle

### Backend (`backend/.env`)
- **Port** : 5001
- **Base de données** : Distante (91.134.35.126) pour avoir des données réelles
- **URL API** : http://localhost:5001
- **CORS** : Autorise http://localhost:5173

### Frontend (`.env`)
- **API URL** : http://localhost:5001

---

## 🚀 Comment Démarrer

### 1. Démarrer le Backend
Ouvrez un terminal dans le dossier `backend` :

```bash
cd backend
npm start
```
*Vous devriez voir : "Server running on port 5001"*

### 2. Démarrer le Frontend
Ouvrez un **nouveau terminal** à la racine du projet :

```bash
npm run dev
```
*Vous devriez voir : "Local: http://localhost:5173/"*

### 3. Tester
Ouvrez **http://localhost:5173** dans votre navigateur.

---

## 🔍 Vérifications

- **Login** : Doit fonctionner (appelle `localhost:5001/api/login`)
- **Données** : Doivent s'afficher (viennent de la BDD distante via votre backend local)
- **Logs Backend** : Vous verrez les requêtes passer dans le terminal du backend
