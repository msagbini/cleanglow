FROM node:22-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY server ./server
COPY public ./public
COPY config ./config

# SQLite data lives here at runtime — mount a persistent volume on this path
# (e.g. a Railway Volume) to keep bookings across container restarts/redeploys.
# No VOLUME instruction here: some hosting platforms (Railway included) reject
# it in favour of configuring the mount from their own dashboard/config.
RUN mkdir -p /app/server/data

ENV PORT=4242
EXPOSE 4242

CMD ["node", "server/index.js"]
