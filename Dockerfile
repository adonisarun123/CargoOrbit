FROM node:24-bookworm-slim AS manifests
WORKDIR /app
COPY package*.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/mobile/package.json apps/mobile/
COPY packages/domain/package.json packages/domain/
COPY packages/database/package.json packages/database/

FROM manifests AS build
RUN npm ci --ignore-scripts
COPY packages packages
COPY apps/api apps/api
COPY apps/web apps/web
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build && mkdir -p apps/web/public

# A fresh scoped install prevents native build/signing tools entering the server image.
FROM manifests AS production-dependencies
RUN npm ci --omit=dev --workspace=@cargoorbit/api --workspace=@cargoorbit/web --include-workspace-root=false --ignore-scripts
RUN test ! -d node_modules/expo && test ! -d node_modules/@expo/cli && test ! -d node_modules/node-forge

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
COPY --from=production-dependencies --chown=node:node /app /app
COPY --from=build --chown=node:node /app/packages/database/dist /app/packages/database/dist
COPY --from=build --chown=node:node /app/packages/domain/dist /app/packages/domain/dist
COPY --from=build --chown=node:node /app/apps/api/dist /app/apps/api/dist
COPY --from=build --chown=node:node /app/apps/web/.next /app/apps/web/.next
COPY --from=build --chown=node:node /app/apps/web/public /app/apps/web/public
COPY --from=build --chown=node:node /app/apps/web/next.config.ts /app/apps/web/next.config.ts
USER node
EXPOSE 3000 4000
# API, worker and web use the same immutable image with distinct commands.
CMD ["node","apps/api/dist/main.js"]
