# Multi-stage Dockerfile for API Service
# Stage 1: Builder
FROM node:20-alpine as builder

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache python3 make g++

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production && \
    npm cache clean --force

# Copy source code
COPY tsconfig.json ./
COPY src ./src

# Build the application
RUN npm run build

# Create a lighter dev dependencies layer for type checking
RUN npm ci

# Stage 2: Runtime
FROM node:20-alpine as runtime

WORKDIR /app

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init curl

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Copy only necessary files from builder
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/package*.json ./

# Switch to non-root user
USER nodejs

# Environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:${PORT}/v1/health || exit 1

# Use dumb-init to handle signals properly
ENTRYPOINT ["/usr/sbin/dumb-init", "--"]

# Start application
CMD ["node", "dist/app.js"]

# Metadata labels
LABEL org.opencontainers.image.title="Visual Home Inventory - API Service"
LABEL org.opencontainers.image.description="Vision AI API proxy service"
LABEL org.opencontainers.image.vendor="Visual Home Inventory"
LABEL org.opencontainers.image.version="1.0.0"

EXPOSE 3000
