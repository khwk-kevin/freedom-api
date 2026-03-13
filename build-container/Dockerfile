# Freedom World — Build Container
# Runs the HTTP exec server that accepts build commands from the main API.
# Uses node:20 (not slim) so git, build tools, and Claude Code all work.

FROM node:20

# Install system dependencies: git + standard build tools
RUN apt-get update && apt-get install -y \
    git \
    build-essential \
    python3 \
    && rm -rf /var/lib/apt/lists/*

# Install Claude Code CLI globally
RUN npm install -g @anthropic-ai/claude-code

WORKDIR /app

# Copy package files and install dependencies
COPY package.json ./
RUN npm install

# Copy source
COPY . .

# Default port (overridden by Railway PORT env var)
EXPOSE 3000

# Start the exec server via ts-node
CMD ["npx", "ts-node", "exec-server.ts"]
