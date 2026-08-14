# Сборка API монорепозитория для облачного хостинга (Render, Railway, Fly).
# Контекст сборки — КОРЕНЬ репозитория, а не apps/api: нужны package-lock.json,
# workspace-манифесты и пакет @gsm/shared, который api подключает исходниками.
#   docker build -f apps/api/Dockerfile -t gsm-api .

# ─── Этап 1: зависимости и сборка ───────────────────────────────────────────
FROM node:20-slim AS builder

# openssl нужен Prisma для генерации клиента под этот дистрибутив.
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Сначала только манифесты: слой с npm ci переиспользуется, пока не менялись
# зависимости, и правка кода не приводит к полной переустановке.
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/

RUN npm ci

COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api

RUN npm run build -w @gsm/shared \
    && npm run db:generate -w @gsm/api \
    && npm run build -w @gsm/api

# ─── Этап 2: рантайм ────────────────────────────────────────────────────────
FROM node:20-slim AS runtime

RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV NODE_ENV=production

# devDependencies намеренно НЕ вырезаются: на старте контейнера выполняются
# prisma migrate deploy и скрипты prisma/*.ts, а Prisma CLI и ts-node живут
# именно там. На free-плане Render отдельного шага деплоя нет, и сделать это
# больше негде. Цена — размер образа, что для демо-стенда приемлемо.
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/package.json ./package.json
COPY --from=builder --chown=node:node /app/tsconfig.base.json ./tsconfig.base.json
COPY --from=builder --chown=node:node /app/packages/shared ./packages/shared
COPY --from=builder --chown=node:node /app/apps/api ./apps/api

COPY --chown=node:node apps/api/docker-entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

USER node

# Порт задаёт платформа через PORT; 3000 — только значение по умолчанию.
EXPOSE 3000

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["node", "apps/api/dist/main.js"]
