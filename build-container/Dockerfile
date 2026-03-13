# Freedom World — Build Container
# Runs the HTTP exec server that accepts build commands from the main API.

FROM node:20

# Install system dependencies
RUN apt-get update && apt-get install -y \
    git \
    build-essential \
    python3 \
    && rm -rf /var/lib/apt/lists/*

# Install Claude Code CLI globally
RUN npm install -g @anthropic-ai/claude-code

WORKDIR /app

# Copy package files and install ALL dependencies (including typescript for build)
COPY package.json ./
RUN npm install --include=dev

# Copy source and compile
COPY . .
RUN npx tsc

EXPOSE 3000
CMD ["node", "dist/exec-server.js"]
