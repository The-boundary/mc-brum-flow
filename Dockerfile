# Multi-stage Dockerfile for Brum Flow

# Stage 1: Build client
FROM node:20-alpine AS client-builder
WORKDIR /app
COPY package*.json ./
COPY client/package*.json ./client/
COPY server/package*.json ./server/
COPY shared/package*.json ./shared/
COPY vendor ./vendor
RUN echo "legacy-peer-deps=true" > .npmrc
RUN npm install --workspace=client --workspace=shared
RUN rm -f .npmrc
COPY client ./client
COPY shared ./shared
COPY tsconfig.base.json ./
ARG GIT_COMMIT_HASH
ENV GIT_COMMIT_HASH=$GIT_COMMIT_HASH
RUN cd client && npx vite build

# Stage 2: Build server
FROM node:20-alpine AS server-builder
WORKDIR /app
COPY package*.json ./
COPY server/package*.json ./server/
COPY client/package*.json ./client/
COPY shared/package*.json ./shared/
COPY vendor ./vendor
RUN echo "legacy-peer-deps=true" > .npmrc
RUN npm install
RUN rm -f .npmrc
COPY server ./server
COPY client ./client
COPY shared ./shared
COPY tsconfig.base.json ./
RUN npm run build --workspace=server

# Stage 3: Production
FROM node:20-alpine AS production
WORKDIR /app
RUN apk add --no-cache dumb-init
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001
COPY package*.json ./
COPY server/package*.json ./server/
COPY shared/package*.json ./shared/
RUN echo "legacy-peer-deps=true" > .npmrc
RUN npm install --workspace=server --workspace=shared --omit=dev
RUN rm -f .npmrc
COPY --from=server-builder /app/server/dist ./server/dist
COPY --from=server-builder /app/shared ./shared
COPY --from=client-builder /app/client/dist ./client/dist
RUN chown -R nodejs:nodejs /app
USER nodejs
ENV NODE_ENV=production
ENV PORT=3001
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001/api/health || exit 1
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "server/dist/index.js"]
