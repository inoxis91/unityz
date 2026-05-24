# Unity'Z Guild Website - Context & Instructions

## Project Overview
- **Name**: Unity'Z Guild Website
- **Goal**: A World of Warcraft guild management site similar to Warcraft Roster.
- **Key Feature**: Battle.net SSO integration for roster and role synchronization.

## Tech Stack
- **Frontend**: Angular (Latest)
- **Backend**: Node.js (Express) with TypeScript
- **Database**: PostgreSQL (via Prisma ORM)
- **Deployment**: Railway (via GitHub)

## Architecture
- **Monorepo Structure**:
  - `/backend`: Node.js Express server handling OAuth2 and API.
  - `/frontend`: Angular SPA for the user interface.

## Conventions
- Use TypeScript for both frontend and backend.
- Follow Angular's official style guide for the frontend.
- Maintain clear separation between API logic and data access in the backend.
- Battle.net credentials must be stored in `.env` files and never committed.

## Development Workflow
1. **Local DB**: Use a local PostgreSQL instance or Railway's development database.
2. **Battle.net API**: Register an application at [Blizzard Developer Portal](https://develop.battle.net/).
3. **Environment Variables**:
   - `BNET_CLIENT_ID`
   - `BNET_CLIENT_SECRET`
   - `BNET_CALLBACK_URL`
   - `DATABASE_URL`
   - `SESSION_SECRET`
