# Use Node.js LTS
FROM node:20-slim

# Create app directory
WORKDIR /app

# Install dependencies for better-sqlite3
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source
COPY . .

# Expose port
EXPOSE 3000

# Start the bot
CMD ["node", "index.js"]
