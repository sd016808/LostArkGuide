FROM node:20-alpine

WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000

# 只有靜態檔與無相依套件的伺服器，不需要 npm install
COPY server.js package.json ./
COPY public ./public

EXPOSE 3000
HEALTHCHECK --interval=60s --timeout=5s --start-period=10s \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1

USER node
CMD ["node", "server.js"]
