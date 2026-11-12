# Build from the repository root:  docker build -f server/Dockerfile -t cotuong .
FROM node:20-alpine
WORKDIR /app
COPY web ./web
COPY server/package.json ./server/
RUN cd server && npm install --omit=dev --no-audit --no-fund
COPY server/server.js ./server/
ENV PORT=3000
EXPOSE 3000
CMD ["node", "server/server.js"]
