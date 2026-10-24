FROM node:24-slim
RUN npm install -g pnpm@12.15.0
WORKDIR /app
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
RUN pnpm install --frozen-lockfile --filter @nexus/server...
COPY packages/shared packages/shared
COPY apps/server apps/server
ENV NODE_ENV=production
CMD ["node", "apps/server/src/index.ts"]
