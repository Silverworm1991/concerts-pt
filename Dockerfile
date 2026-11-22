# One Dockerfile for every service: docker build --build-arg SERVICE=<name> .
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages ./packages
COPY services ./services
RUN npm ci
RUN npm run build
RUN npm prune --omit=dev

FROM node:22-alpine
ARG SERVICE
ENV SERVICE=$SERVICE NODE_ENV=production
WORKDIR /app
COPY --from=build /app ./
USER node
CMD ["sh", "-c", "node services/$SERVICE/dist/index.js"]
