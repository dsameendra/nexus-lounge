FROM node:24-slim
RUN npm install -g pnpm@12.15.0
WORKDIR /app
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile --filter @nexus/web...
COPY packages/shared packages/shared
COPY apps/web apps/web
RUN pnpm --filter @nexus/web build
ENV NODE_ENV=production
CMD ["sh", "-c", "cd apps/web && exec node_modules/.bin/next start -H 0.0.0.0 -p ${PORT:-3000}"]
