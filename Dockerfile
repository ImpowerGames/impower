FROM node:20-slim as builder
ENV NODE_ENV production
WORKDIR /usr/src/app
COPY ./packages/impower-dev/package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-slim
ENV NODE_ENV production
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm ci --only=production
COPY --from=builder /usr/src/app/out ./out
CMD [ "node", "out/api/index.js" ]