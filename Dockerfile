# Stage 1: Build the Angular application
FROM node:20-alpine AS frontend-build
WORKDIR /app-frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ .
RUN npm run build

# Stage 2: Build the Backend and Final Image
FROM node:20-alpine
WORKDIR /app

# Install Backend dependencies
# Note: In the final image, we put everything in /app
COPY backend/package*.json ./
RUN npm install

# Copy Backend source code and build
COPY backend/ .
RUN npm run build

# Copy Frontend build output to backend public directory
# Ensure the path matches the Angular output (dist/frontend/browser)
COPY --from=frontend-build /app-frontend/dist/frontend/browser ./public

EXPOSE 3000

# En production, on lance le code compilé du backend
CMD ["node", "dist/index.js"]
