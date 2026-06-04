# Guild Manager - WoW Guild Management Platform

A modern, SaaS-oriented web application for managing World of Warcraft guilds, featuring Battle.net SSO integration, dynamic raid calendar, roster management, and treasury/fee tracking.

## Deployment on Railway

This project is structured as a monorepo and is fully compatible with Railway deployment.

### 1. PostgreSQL Database
- In Railway, add a **PostgreSQL** service/database.
- It will automatically provide a `DATABASE_URL` environment variable.

### 2. Backend Service
- Point Railway to the `/backend` directory.
- Add the following environment variables:
  - `DATABASE_URL` (Automatically linked by Railway if using the plugin)
  - `BNET_CLIENT_ID`
  - `BNET_CLIENT_SECRET`
  - `BNET_CALLBACK_URL`: `https://your-backend.up.railway.app/api/auth/bnet/callback`
  - `SESSION_SECRET`: A long random string.
  - `FRONTEND_URL`: `https://your-frontend.up.railway.app`
  - `NODE_ENV`: `production`

### 3. Frontend Service
- Point Railway to the `/frontend` directory.
- Railway will detect it's an Angular app and build it automatically.

## Installation Locale (Docker)

Le projet est entièrement conteneurisé. Pour le lancer localement :

1. **Configuration des variables d'environnement** :
   Le fichier `backend/.env` sera créé automatiquement lors du premier lancement, mais vous devrez y renseigner vos identifiants Battle.net.

2. **Lancer le projet** :
   ```bash
   docker-compose up --build -d
   ```

3. **Accès** :
   - Frontend : [http://localhost:4200](http://localhost:4200)
   - Backend : [http://localhost:3000](http://localhost:3000)

4. **Redémarrer en cas de changement** :
   Si les changements ne sont pas pris en compte (notamment sur le frontend), forcez la reconstruction :
   ```bash
   docker compose down && docker compose up --build
   ```
