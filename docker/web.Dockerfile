# Frontend production: Vite build + Express proxy (/api → API service)
FROM node:20-bookworm-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY index.html vite.config.ts tsconfig.json tsconfig.node.json tailwind.config.js postcss.config.js ./
COPY public ./public
COPY src ./src

# Browser memanggil /api di host yang sama (Express mem-proxy ke service api)
ENV VITE_API_URL=
ENV VITE_SUPABASE_ANON_KEY=railway-internal

RUN npm run build

FROM node:20-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3001

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY server ./server
COPY --from=build /app/dist ./dist

EXPOSE 3001

CMD ["node", "server/index.js"]
