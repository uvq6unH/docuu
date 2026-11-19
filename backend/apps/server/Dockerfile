# Stage 1: Build packages and server
FROM node:24-alpine AS builder

WORKDIR /app

# Copy package descriptors and sources
COPY packages/shared packages/shared
COPY backend backend

# Install dependencies and build shared package
RUN npm --prefix packages/shared ci && npm --prefix packages/shared run build

# Install dependencies and build server
RUN npm --prefix backend/apps/server ci && npm --prefix backend/apps/server run build

# Stage 2: Minimal Production Image
FROM node:24-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001

# Copy compiled shared library and map files
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/shared/maps ./packages/shared/maps
COPY --from=builder /app/packages/shared/package.json ./packages/shared/package.json

# Copy compiled backend server and production dependencies
COPY --from=builder /app/backend/apps/server/dist ./backend/apps/server/dist
COPY --from=builder /app/backend/apps/server/package.json ./backend/apps/server/package.json
COPY --from=builder /app/backend/apps/server/node_modules ./backend/apps/server/node_modules

EXPOSE 3001

# Deep healthcheck against /healthz
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -q -O - http://localhost:3001/healthz || exit 1

CMD ["node", "backend/apps/server/dist/index.js"]
