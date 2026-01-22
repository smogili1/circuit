# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY backend/package*.json ./backend/
COPY frontend/package*.json ./frontend/

# Install dependencies
RUN npm install

# Copy source code
COPY backend ./backend
COPY frontend ./frontend

# Build frontend
RUN npm run build --workspace=frontend

# Production stage
FROM node:20-alpine

WORKDIR /app

# Install only production dependencies for backend
COPY package*.json ./
COPY backend/package*.json ./backend/
RUN npm install --workspace=backend --production=false

# Copy backend source (uses tsx runtime, no build needed)
COPY backend ./backend

# Copy built frontend
COPY --from=builder /app/frontend/dist ./frontend/dist

# Create data directory for persistent storage
RUN mkdir -p /app/data/workflows /app/data/executions

# Environment variables
ENV NODE_ENV=production
ENV PORT=3001
ENV WORKFLOWS_DIR=/app/data/workflows
ENV EXECUTIONS_DIR=/app/data/executions
ENV MCP_CONFIG_DIR=/app/data

EXPOSE 3001

# Start the server
WORKDIR /app/backend
CMD ["npm", "start"]
