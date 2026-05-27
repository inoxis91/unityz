# Stage 1: Build the Angular application
FROM node:20-alpine AS build

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install

# Copy source code
COPY . .

# Build for production (This is needed for the production stage)
RUN npm run build

# Default command if someone runs this stage (for dev)
CMD ["npm", "start"]

# Stage 2: Serve the application with Nginx (Optimized for Production)
FROM nginx:alpine AS production

# Copy the build output to the Nginx html directory
COPY --from=build /app/dist/frontend/browser /usr/share/nginx/html

# SPA configuration for Nginx
RUN echo 'server { \
    listen 4200; \
    location / { \
        root /usr/share/nginx/html; \
        index index.html; \
        try_files $uri $uri/ /index.html; \
    } \
}' > /etc/nginx/conf.d/default.conf

EXPOSE 4200

CMD ["nginx", "-g", "daemon off;"]
