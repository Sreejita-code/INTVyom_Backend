FROM node:20-alpine AS deps
WORKDIR /app

COPY package*.json ./
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi \
  && npm cache clean --force

FROM gcr.io/distroless/nodejs20-debian12:nonroot AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
# The MCP docs server reports its version from package.json at require time.
COPY --chown=nonroot:nonroot package.json ./package.json
COPY --chown=nonroot:nonroot src ./src
COPY --chown=nonroot:nonroot swagger.yaml ./swagger.yaml
# Developer docs served by the MCP dev-doc tools; without them those tools answer "no docs".
COPY --chown=nonroot:nonroot docs ./docs

EXPOSE 3000
CMD ["src/index.js"]
