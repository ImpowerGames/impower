# Serve the already-built /dist with Nginx
FROM nginx:1.27-alpine

# Cloud Run sends traffic to $PORT, so make Nginx listen on 8080
ENV PORT=8080

# Replace default site with SPA-friendly config (fallback to /index.html)
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy the built static files from the build context (Cloud Build created dist/ already)
COPY dist /usr/share/nginx/html

EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]