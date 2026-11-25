# Stage 1: Build shared package and frontend client
FROM node:24-alpine AS builder

WORKDIR /app

# Copy shared definitions and frontend source
COPY packages/shared packages/shared
COPY frontend frontend

# Install and build shared library
RUN npm --prefix packages/shared ci && npm --prefix packages/shared run build

# Install and build frontend distribution
RUN npm --prefix frontend ci && npm --prefix frontend run build

# Stage 2: Production Nginx Server
FROM nginx:alpine

# Copy built web application
COPY --from=builder /app/frontend/dist /usr/share/nginx/html

# Copy custom Nginx configuration with WebSocket reverse proxy
COPY nginx/nginx.conf /etc/nginx/nginx.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
