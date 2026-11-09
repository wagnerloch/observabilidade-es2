# Uma única imagem para os 3 serviços (pedidos, pagamentos, cozinha).
# O docker-compose escolhe qual serviço cada container executa.

FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY public ./public
COPY package.json ./
EXPOSE 3000
# --require carrega o OpenTelemetry ANTES do Express (necessário para auto-instrumentação)
ENTRYPOINT ["node", "--require", "./dist/tracing.js"]
CMD ["dist/pedidos.js"]
