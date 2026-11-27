# Revspot Central: one Next.js server (pages + its own /api routes).
# On Marketplace it is served at /p/{slug}/; see DEPLOY.md.

# ---- build ----
FROM node:22-alpine AS build
WORKDIR /app

# Baked in at `next build`. Marketplace may not pass build args (it writes its own
# compose file), so next.config.ts treats a bare "/" as unset and falls back to
# BASE_PATH in the .env that ships with the deployment. VITE_API_URL is part of the
# Marketplace contract; this app does not read it.
ARG BASE_PATH=/
ARG VITE_API_URL=
ENV BASE_PATH=$BASE_PATH
ENV VITE_API_URL=$VITE_API_URL
ENV NEXT_TELEMETRY_DISABLED=1

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# ---- run ----
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=80

COPY --from=build /app ./

EXPOSE 80
CMD ["node", "server.mjs"]
