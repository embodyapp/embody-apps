FROM node:24-alpine
WORKDIR /app
COPY . .
RUN npm install && npm run build && chown -R node:node /app
USER node
EXPOSE 8080
HEALTHCHECK CMD node -e "fetch('http://127.0.0.1:8080/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/src/index.js"]
