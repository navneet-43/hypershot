# Use Node.js LTS
FROM node:20-slim

# Install FFmpeg for video processing
RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy built files
COPY dist/ ./dist/
COPY drizzle/ ./drizzle/

# Set environment variables
ENV NODE_ENV=production
ENV PORT=8080

# Expose the port
EXPOSE 8080

# Start the server
CMD ["node", "dist/index.js"]

