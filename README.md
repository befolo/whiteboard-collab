# Whiteboard Collaboratif 

Une application de tableau blanc collaboratif en temps réel, complète et performante. Permet aux utilisateurs de créer des tableaux, de dessiner et d'interagir simultanément.

## Fonctionnalités

- **Authentification Sécurisée** : Inscription et connexion utilisateurs (avec hachage de mot de passe et sessions).
- **Gestion des Tableaux** : Création, suppression et listage de tableaux personnels.
- **Collaboration Temps Réel** :
  - Dessin simultané avec mise à jour en direct via WebSockets.
  - Curseur, pan et zoom fluides.
  - Gestion des utilisateurs connectés (entrée/sortie).
- **Persistance des Données** : Sauvegarde automatique des traits et dessins dans une base de données SQLite.

## Stack Technique

### Frontend (`/front`)
- **React 19** : Interface utilisateur réactive.
- **Vite** : Mode développement rapide et build optimisé.
- **TailwindCSS & DaisyUI** : Styles modernes et composants UI.
- **Axios** : Requêtes API.
- **WebSockets** : Communication temps réel native.

### Backend (`/backend`)
- **Node.js & Fastify** : Serveur HTTP haute performance.
- **@fastify/websocket** : Gestion optimisée des WebSockets.
- **Better-SQLite3** : Base de données locale rapide et fiable.
- **Zod & Bcrypt** : Validation des données et sécurité.

## Installation et Démarrage

### Prérequis
- Node.js (v18 ou supérieur recommandé)
- NPM ou PNPM

### 1. Démarrer le Backend
Le serveur API et WebSocket tourne sur le port `3000`.

```bash
cd backend
npm install
npm run dev
```

La base de données SQLite (`database.db`) sera automatiquement initialisée au premier lancement.

### 2. Démarrer le Frontend
L'interface utilisateur tourne par défaut sur le port `5173`.

```bash
cd front
npm install
npm run dev
```

### 3. Utilisation
Ouvrez votre navigateur sur **http://localhost:5173**.
1. Créez un compte ou connectez-vous.
2. Créez un nouveau tableau depuis le tableau de bord.
3. Commencez à dessiner ! Ouvrez le même tableau dans un autre onglet pour tester la collaboration.

## Structure du Projet

```
whiteboard/
├── backend/         # Serveur API & WebSocket
│   ├── src/
│   │   ├── routes/  # Routes API (auth, boards)
│   │   ├── server.js # Point d'entrée
│   │   └── db.js     # Connexion DB
│   └── database.db   # Fichier DB SQLite
│
└── front/           # Application Client React
    ├── src/
    │   ├── components/ # Composants React (Canvas, Tools...)
    │   ├── context/    # Gestion d'état global
    │   └── App.jsx     # Routing
    └── vite.config.js
```
