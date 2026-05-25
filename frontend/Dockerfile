FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install

# Copy source code and build
COPY . .
RUN npm run build

EXPOSE 4200

# En production sur Railway, on utilise un serveur simple pour le dossier dist
RUN npm install -g serve
CMD ["serve", "-s", "dist/frontend/browser", "-l", "4200"]
