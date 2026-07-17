FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json ./
# Inclut tsx / dotenv pour migrate + import dans le conteneur
RUN npm install

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json tsconfig.json drizzle.config.ts ./
COPY src ./src
COPY drizzle ./drizzle
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
COPY package.json ./
COPY --from=build /app/dist ./dist
COPY --from=build /app/drizzle ./drizzle
COPY --from=deps /app/node_modules ./node_modules
# Sources TS pour import:communes / seed via tsx (jobs deploy.sh)
COPY src ./src
EXPOSE 3000
CMD ["node", "dist/index.js"]
