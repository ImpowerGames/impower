FROM node:20-slim as builder
WORKDIR /usr/src/app
COPY . .
RUN cd ./impower-dev && npm run ci-install && npm run build && cd ../

FROM node:20-slim
WORKDIR /usr/src/app
COPY --from=builder /usr/src/app/impower-dev/out ./out
ENTRYPOINT [ "node", "out/api/index.js" ]