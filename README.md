# Unity'Z - WoW Guild Website

A modern web application for the "Unity'Z" World of Warcraft guild, featuring Battle.net SSO integration and roster management.

## Deployment on Railway

This project is structured as a monorepo and is ready for Railway.

### 1. PostgreSQL Database
- In Railway, add a **PostgreSQL** plugin.
- It will automatically provide a `DATABASE_URL`.

### 2. Backend Service
- Point Railway to the `/backend` directory.
- Add the following environment variables:
  - `DATABASE_URL` (Automatically linked by Railway if using the plugin)
  - `BNET_CLIENT_ID`
  - `BNET_CLIENT_SECRET`
  - `BNET_CALLBACK_URL`: `https://votre-backend.up.railway.app/api/auth/bnet/callback`
  - `SESSION_SECRET`: A long random string.
  - `FRONTEND_URL`: `https://votre-frontend.up.railway.app`
  - `NODE_ENV`: `production`

### 3. Frontend Service
- Point Railway to the `/frontend` directory.
- Railway will detect it's an Angular app and build it automatically.

## Local Setup
1. Run `docker-compose up -d` to start the local DB.
2. Run `npm run setup` at the root.
3. Run `npm run dev` to start both servers.
