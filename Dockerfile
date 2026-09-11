FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY index.html vite.config.js ./
COPY src ./src
COPY public ./public
# bust-cache: 2026-09-11c-force-rebuild
RUN npm run build

FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && mkdir /app/data && chown node:node /app/data
COPY --from=build /app/dist ./dist
COPY server ./server
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4380 DATA_DIR=/app/data
USER node
EXPOSE 4380
CMD ["node","server/index.js"]
