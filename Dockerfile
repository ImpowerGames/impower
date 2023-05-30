FROM node:20-slim as builder
WORKDIR /usr/src/app
COPY ./packages/impower-dev/ .
RUN npm ci && npm run build

FROM node:20-slim
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm ci --only=production
COPY --from=builder /usr/src/app/out ./out
CMD [ "node", "out/api/index.js" ]