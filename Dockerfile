FROM node:20-slim as builder
WORKDIR /usr/src/app
COPY . .
ARG BROWSER_GOOGLE_API_KEY
ENV BROWSER_GOOGLE_API_KEY $BROWSER_GOOGLE_API_KEY
ARG BROWSER_GOOGLE_OAUTH_CLIENT_ID
ENV BROWSER_GOOGLE_OAUTH_CLIENT_ID $BROWSER_GOOGLE_OAUTH_CLIENT_ID
RUN cd ./impower-dev && npm run postinstall && npm ci && npm run build && cd ../

FROM node:20-slim
WORKDIR /usr/src/app
COPY --from=builder /usr/src/app/impower-dev .
ENTRYPOINT [ "node", "out/api/index.js" ]