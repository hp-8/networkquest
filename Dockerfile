# NetworkQuest, hosted. Node 24 for the built-in SQLite; no npm dependencies to install.
FROM node:24-slim
WORKDIR /app
COPY package.json ./
COPY src ./src
COPY public ./public
# The database, Google tokens and settings live on the mounted volume.
ENV NODE_ENV=production NQ_HOME=/data PORT=8080
EXPOSE 8080
# Runs as root: Fly mounts the volume root-owned. The VM itself is the isolation boundary.
CMD ["node", "--no-warnings", "src/cli.js", "ui"]
