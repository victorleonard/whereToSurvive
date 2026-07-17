FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json ./
RUN npm install

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json astro.config.mjs tsconfig.json ./
COPY public ./public
COPY src ./src
# API_URL = SSR (réseau Docker). PUBLIC_API_URL = navigateur (IP/domaine public).
ARG API_URL=http://api:3000
ARG PUBLIC_API_URL=http://127.0.0.1:3000
ENV API_URL=$API_URL
ENV PUBLIC_API_URL=$PUBLIC_API_URL
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=4321
ENV API_URL=http://api:3000
COPY package.json ./
COPY --from=build /app/dist ./dist
COPY --from=deps /app/node_modules ./node_modules
EXPOSE 4321
CMD ["node", "./dist/server/entry.mjs"]
