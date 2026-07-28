FROM node:22-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY server ./server
COPY public ./public
COPY config ./config

# SQLite data lives here at runtime — mount a volume on this path to persist
# bookings across container restarts/redeploys.
RUN mkdir -p /app/server/data
VOLUME /app/server/data

ENV PORT=4242
EXPOSE 4242

CMD ["node", "server/index.js"]
