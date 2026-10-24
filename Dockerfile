FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package*.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/mobile/package.json apps/mobile/
COPY packages/domain/package.json packages/domain/
COPY packages/database/package.json packages/database/
RUN npm ci --workspace @cargoorbit/api --workspace @cargoorbit/web --include-workspace-root
COPY packages packages
COPY apps/api apps/api
COPY apps/web apps/web
RUN npm run build

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /app /app
USER node
EXPOSE 3000 4000
CMD ["npm","run","start","-w","@cargoorbit/api"]
