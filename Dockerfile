# syntax=docker/dockerfile:1

# ---- Stage 1: build the React client to static assets ----
FROM node:20-alpine AS client
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

# ---- Stage 2: runtime (Express API + static client) ----
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Server production dependencies only
COPY package*.json ./
RUN npm ci --omit=dev --legacy-peer-deps

# Server source + LiteLLM config + built client
COPY server/ ./server/
COPY litellm/ ./litellm/
COPY --from=client /app/client/build ./client/build

EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001/api/health || exit 1

CMD ["node", "server/index.js"]
