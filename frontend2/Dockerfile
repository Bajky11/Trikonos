# syntax=docker/dockerfile:1

# Vite+ needs Node.js; Bun is the package manager and script runner.
FROM oven/bun:1.4.4 AS bun
FROM node:24-bookworm-slim AS dependencies
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM dependencies AS development
COPY . .
EXPOSE 5173
# Refresh the persistent node_modules volume after dependency changes.
CMD ["sh", "-c", "bun install --frozen-lockfile && exec bun run dev -- --host 0.0.0.0 --strictPort"]

FROM dependencies AS build
COPY . .
RUN bun run build

# No Node.js, Bun, source files or node_modules in the production image.
FROM nginx:stable-alpine AS production
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD wget -q -O /dev/null http://127.0.0.1/healthz || exit 1
