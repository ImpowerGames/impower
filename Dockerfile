FROM node:20-slim as builder
WORKDIR /usr/src/app
COPY . .
RUN cd ./packages/impower-dev && npm ci && npm run build && cd ../.. 

FROM node:20-slim
WORKDIR /usr/src/app
COPY --from=builder /usr/src/app/packages/impower-dev/out .
CMD [ "node", "api/index.js" ]