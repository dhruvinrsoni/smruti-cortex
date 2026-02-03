# Multi-stage build optimized for reproducible extension builds
# Uses Node LTS (20) on Debian slim for broad compatibility
FROM node:20-bullseye-slim AS builder

WORKDIR /app

# Install dependencies first (cached layer)
COPY package.json package-lock.json ./
RUN npm ci --no-audit --prefer-offline --progress=false

# Copy source and build
COPY . ./

# Ensure environment is production for build optimizations
ENV NODE_ENV=production

# Run the repository's build script (keeps parity with local builds)
RUN npm run build

# Final stage: expose build artifacts (dist/) and keep image lightweight
FROM node:20-bullseye-slim AS runner
WORKDIR /app

# Copy entire app with node_modules (don't need to split them)
COPY --from=builder /app .

# Set non-root user for safety
RUN useradd --user-group --create-home --shell /bin/false appuser && chown -R appuser:appuser /app
USER appuser

# Default command
CMD ["/bin/sh","-c","echo Built artifacts are available under /app/dist"]
