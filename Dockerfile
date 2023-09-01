FROM node:20-slim as builder
WORKDIR /usr/src/app
COPY . .
RUN cd ./impower-dev && npm run preinstall && npm ci && npm run build && cd ../

FROM node:20-slim
WORKDIR /usr/src/app
COPY --from=builder /usr/src/app/impower-dev ./impower-dev
ENTRYPOINT [ "node", "impower-dev/out/api/index.js" ]